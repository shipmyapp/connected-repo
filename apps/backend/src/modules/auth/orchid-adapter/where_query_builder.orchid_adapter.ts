import { Db } from "@backend/db/db";
import { ModelName } from "@backend/modules/auth/orchid-adapter/model_table_map.orchid_adapter";
import { type Where } from "better-auth";

/**
 * Maps better-auth operators to Orchid ORM operators.
 */
const operatorMap: Record<string, string> = {
  ne: 'not',
  lt: 'lt',
  lte: 'lte',
  gt: 'gt',
  gte: 'gte',
  in: 'in',
  not_in: 'notIn',
  contains: 'contains',       // LIKE '%value%'
  starts_with: 'startsWith',  // LIKE 'value%'
  ends_with: 'endsWith',      // LIKE '%value'
};

/**
 * Applies better-auth Where clauses to an Orchid ORM query builder.
 * 
 * This function follows the same pattern as the Drizzle adapter's convertWhereClause:
 * 1. Separate clauses into AND and OR groups based on connector
 * 2. For AND group, merge conditions - including duplicate fields by merging operators
 * 3. For OR group, build array of condition objects
 * 4. Apply all in single .where() call to preserve table default scopes
 * 5. Follows code at https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/adapters/drizzle-adapter/drizzle-adapter.ts
 * 
 * IMPORTANT: Uses single .where() call with merged operators for duplicate fields.
 * Example: age > 18 AND age < 40 becomes { age: { gt: 18, lt: 40 } }
 * 
 * Edge cases handled:
 * 
 * 1. EMPTY/UNDEFINED WHERE CLAUSES:
 *    - If whereClauses is empty or undefined, returns query unchanged
 *    - Preserves default table scopes (e.g., session expiration filters)
 * 
 * 2. SINGLE WHERE CLAUSE:
 *    - Applies directly using .where() with single condition object
 *    - Example: WHERE age = 18 → .where({ age: 18 })
 * 
 * 3. MULTIPLE AND CONDITIONS (NO DUPLICATES):
 *    - Merges into single object and applies with one .where() call
 *    - Example: WHERE age = 18 AND name = 'John' → .where({ age: 18, name: 'John' })
 * 
 * 4. MULTIPLE AND CONDITIONS (WITH DUPLICATE FIELDS):
 *    - Merges operators for the same field into a single object
 *    - Example: WHERE age > 18 AND age < 40
 *    - Becomes: .where({ age: { gt: 18, lt: 40 } })
 *    - SQL: WHERE age > 18 AND age < 40
 * 
 * 5. DUPLICATE FIELD WITH EQ OPERATOR:
 *    - If field appears with 'eq' operator, it overwrites other operators
 *    - Example: age > 18 AND age = 25 → { age: 25 } (equality takes precedence)
 *    - This matches SQL behavior where "age = 25" would override "age > 18"
 * 
 * 6. MULTIPLE OR CONDITIONS:
 *    - Groups all OR conditions in array using Orchid's OR special key
 *    - Example: WHERE name = 'Alice' OR name = 'Bob'
 *    - Becomes: .where({ OR: [{ name: 'Alice' }, { name: 'Bob' }] })
 * 
 * 7. MIXED AND/OR CONDITIONS:
 *    - Merges AND group (with duplicate field handling) and OR group in single object
 *    - Example: WHERE age > 18 AND age < 40 AND (name = 'Alice' OR name = 'Bob')
 *    - Becomes: .where({ age: { gt: 18, lt: 40 }, OR: [{ name: 'Alice' }, { name: 'Bob' }] })
 *    - SQL: WHERE age > 18 AND age < 40 AND (name = 'Alice' OR name = 'Bob')
 * 
 * @param query - The Orchid ORM query builder instance for a specific table
 * @param whereClauses - Array of Better Auth Where clause objects
 * @returns Modified query builder with WHERE conditions applied
 * 
 * @see https://orchid-orm.netlify.app/guide/where.html#where
 * @see https://orchid-orm.netlify.app/guide/where.html#where-special-keys
 */
export function applyBetterAuthWhere(query: Db[ModelName], whereClauses: Where[] | undefined = []): any {
  // Edge case 1: Empty or undefined where clauses
  if (!whereClauses || whereClauses.length === 0) {
    return query;
  }

  // Edge case 2: Single where clause - apply directly
  if (whereClauses.length === 1) {
    const clause = whereClauses[0];
    if (!clause) return query;
    
    const { field, value, operator = "eq" } = clause;
    
    let fieldValue: any;
    if (operator === "eq") {
      fieldValue = value;
    } else {
      const orchidOp = operatorMap[operator];
      fieldValue = orchidOp ? { [orchidOp]: value } : value;
    }
    
    return query.where({ [field]: fieldValue });
  }

  // Separate AND and OR groups (following Drizzle adapter pattern)
  const andGroup = whereClauses.filter((w) => w.connector === "AND" || !w.connector);
  const orGroup = whereClauses.filter((w) => w.connector === "OR");

  const whereObject: Record<string, any> = {};

  // Process AND group - Edge cases 3, 4, 5
  if (andGroup.length > 0) {
    for (const clause of andGroup) {
      const { field, value, operator = "eq" } = clause;
      
      if (operator === "eq") {
        // Edge case 5: Equality operator - overwrites any existing operators
        whereObject[field] = value;
      } else {
        const orchidOp = operatorMap[operator];
        const opValue = orchidOp ? { [orchidOp]: value } : value;
        
        if (field in whereObject) {
          // Edge case 4: Duplicate field detected
          const existing = whereObject[field];
          
          if (typeof existing === 'object' && existing !== null && !Array.isArray(existing) && 
              typeof opValue === 'object' && opValue !== null && !Array.isArray(opValue)) {
            // Both existing and new values are operator objects, merge them
            // Example: { age: { gt: 18 } } + { age: { lt: 40 } } = { age: { gt: 18, lt: 40 } }
            whereObject[field] = { ...existing, ...opValue };
          } else {
            // One of the values is not an operator object (e.g., from 'eq' operator)
            // Keep existing value (equality or first value takes precedence)
            // This handles: age = 25 AND age > 18 → age = 25
          }
        } else {
          // Edge case 3: First occurrence of this field
          whereObject[field] = opValue;
        }
      }
    }
  }

  // Process OR group - Edge case 6 & 7
  if (orGroup.length > 0) {
    const orConditions: Record<string, any>[] = [];
    
    for (const clause of orGroup) {
      const { field, value, operator = "eq" } = clause;
      
      let fieldValue: any;
      if (operator === "eq") {
        fieldValue = value;
      } else {
        const orchidOp = operatorMap[operator];
        fieldValue = orchidOp ? { [orchidOp]: value } : value;
      }
      
      orConditions.push({ [field]: fieldValue });
    }
    
    // Add OR group using Orchid's OR special key
    whereObject.OR = orConditions;
  }

  // Apply all conditions in a single .where() call to maintain scope
  return query.where(whereObject);
}