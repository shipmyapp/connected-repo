# Backend Agent Guidelines (AGENTS.md)

## 1. Blueprint
**Intent**: Robust, event-driven oRPC backend with strict schema enforcement and zero-downtime compatibility.
**Core Stack**: oRPC, Orchid ORM, pg-tbus, Better Auth, SuprSend, SSE.

**Key Architectures**:
- **Event-Driven**: `pg-tbus` for async tasks (notifications, usage tracking) and events.
- **Delta Sync**: Real-time updates triggered by Orchid ORM hooks.
- **Backward Compatibility**: N-1 frontend support; additive-only migrations; two-step deletions.
- **Dual Team Model**: `teams_app` (Session/UI) vs `teams_api` (Key/External).

---

## 2. Active Task
**Context**: Standardizing backend documentation lifecycle.
**Current Status**: Refactoring `AGENTS.md` to 3-layer lifecycle.
**Intent**: Maintain precise patterns for migrations, oRPC, and sync.

---

## 3. Decision Records
| ID | Title | Status | Description |
|---|---|---|---|
| [ADR-B01] | Additive Migrations | Accepted | Never rename/drop in one deployment to avoid downtime. |
| [ADR-B02] | Mutex Cron | Accepted | Prevent concurrent cron runs via `isCronJobRunning` flag. |
| [ADR-B03] | Soft Delete | Accepted | Mandatory for sync compatibility (use `deletedAt` field). |

## Technical Guidelines

### Module Structure
```
src/
├── modules/<module>/
│   ├── tables/
│   ├── routers/
│   └── events/
├── procedures/ (public, protected, sensitive, open_api)
├── db/ (db.ts, base_table.ts)
└── events/ (tbus setup)
```

### Database & Migrations
- **Auto-Gen**: `yarn db g <name>` is MANDATORY.
- **Descriptive IDs**: `userId`, `teamId` (PascalCase class, snake_case columns).
- **ORM Hooks**: Use `afterCreate`/`afterUpdate` to push entries to `syncService`.

### oRPC Endpoints
```typescript
export const create = rpcProtectedProcedure
  .input(schema)
  .handler(async ({ input, context }) => {
    return db.table.create({ ...input, authorUserId: context.user.id });
  });
```

### Event Bus (pg-tbus)
- **Emit**: `tbus.emit(eventDef, payload)`.
- **Tasks**: `tbus.registerTask(taskDef, handler)` with exponential backoff.

### Security
- **Auth**: Better Auth for sessions; `api-key-auth` for external.
- **Procedures**: Use `rpcSensitiveProcedure` for data-destructive actions.

### Testing
- **Vitest**: Test all CRUD operations. Use `createTestUserAndSession` for auth context.
