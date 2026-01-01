
type JoinConfig = {
  [model: string]: {
    /**
     * The joining column names.
     */
    on: {
      /**
       * Column name from the main table
       */
      from: string;
      /**
       * Column name from the joined table
       */
      to: string;
    };
    /**
     * Limit the number of rows to return.
     *
     * If the relation has `unique` constraint, then this option will be ignored and limit will be set to 1.
     *
     * @default 100
     */
    limit?: number;
    /**
     * The relation type. Determines the output joined model data.
     *
     * `one-to-one` would have a single object in the output.
     * `one-to-many` would have an array of objects in the output.
     * `many-to-many` would have an array of objects in the output.
     *
     * @default "one-to-many"
     */
    relation?: "one-to-one" | "one-to-many" | "many-to-many";
  };
};

/**
 * Applies better-auth JoinConfig to an Orchid ORM query.
 * @param query The current Orchid ORM query builder instance.
 * @param joinConfig The join configuration from better-auth.
 * @param db The Orchid ORM database instance (or a map of model names to Table objects).
 * @returns An object with the modified query and select objects for joined tables
 */
export const applyJoins = (
  query: any, 
  joinConfig: JoinConfig | undefined,
  db: Record<string, any>
) => {
  if (!joinConfig) return query;

  let joinQuery = query;
  const mainTableName = query.table; // Get parent table name (e.g., 'users')
  const mainTable = db[mainTableName]

  for (const [modelName, config] of Object.entries(joinConfig)) {
    const targetTable = db[modelName];
    if (!targetTable) continue;

    const { on, limit, relation } = config;

    if (relation === 'one-to-one') {
      joinQuery = joinQuery.select({
        [modelName]: () => 
          targetTable
            .selectAll()
            .where({ [on.to]: mainTable[on.from] })
            .takeOptional()
      })
    } else {
      joinQuery = joinQuery.select({
        [modelName]: () => 
          targetTable
            .selectAll()
            .where({ [on.to]: mainTable[on.from] }) // Link to parent
            .limit(limit || 100)
      });
    }
  }

  return joinQuery;
}