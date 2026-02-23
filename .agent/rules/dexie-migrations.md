# Dexie Schema & Migrations

Ensures frontend database schema changes are managed through explicit versioning and migrations in Dexie.

## Rules

1. **Version Increment**: Any change to the database schema in `apps/frontend/src/worker/db/db.manager.ts` MUST be accompanied by an increment of the database version number.
2. **Explicit Migrations**: 
    - Use the `.version(N).stores({...})` pattern to define new schema versions.
    - If a schema change requires data transformation (e.g., renaming a property, moving data), implement it in an `.upgrade(trans => { ... })` block for that version.
3. **Immutability of History**: NEVER modify the schema definition or upgrade logic of a previous version. Always add a new version block.
4. **Push Awareness**: Explicit migrations (`.upgrade()`) are ONLY required for changes compared to the latest PUSHED/DEPLOYED code. 
    - During local development, if a schema change has NOT been pushed to a shared branch or production, you MAY modify the latest version's `stores` or `upgrade` block directly to avoid version bloat.
    - Once pushed, the version is "locked" and subsequent changes require a new version number.
5. **Source of Truth**: `apps/frontend/src/worker/db/db.manager.ts` is the sole source of truth for the Dexie schema.
6. **Worker Isolation**: The database instance MUST only be directly utilized within the Data Worker. UI components must interact with the DB via the established proxy pattern.

## Code Examples

### Defining a New Version with Migration

```typescript
// apps/frontend/src/worker/db/db.manager.ts

// Existing version
this.version(3).stores({
  leads: "leadId, teamId, createdAt, updatedAt",
});

// New version with migration
this.version(4).stores({
  leads: "leadId, teamId, createdAt, updatedAt, status", // Added status index
}).upgrade(async (tx) => {
  // Migration logic if needed
  await tx.table("leads").toCollection().modify(lead => {
    if (!lead.status) lead.status = 'active';
  });
});
```

> [!IMPORTANT]
> Always verify that the new version number is exactly $current\_version + 1$.