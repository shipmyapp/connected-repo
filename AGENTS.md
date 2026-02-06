# Expowiz - Agent Guidelines

**Trade Fair Lead Capture & Team Collaboration Platform**

---

## Quick Reference

**Core Stack:**
- **Backend**: oRPC + Orchid ORM + pg-tbus + Better Auth
- **Frontend**: React 19 + Vite + Data Worker + TinyBase + MUI
- **Shared**: Zod Schemas + UI Package

**Commands:**
- Dev: `yarn dev` (all apps)
- Build: `yarn build` (all workspaces)
- Lint/Format: `yarn lint`, `yarn format` (Biome: tabs, 100 chars, double quotes)
- Type Check: `yarn check-types`
- DB: `yarn db g <name>`, `yarn db up`, `yarn db seed`, `yarn test:db:setup`

**Code Style:**
- Tabs (NOT spaces), 100 char line width, double quotes
- NO `any` or `as unknown` - strict TypeScript
- Direct imports: `@connected-repo/ui-mui/form/Button` (NO barrel exports)
- Naming: camelCase (code), snake_case (DB), descriptive IDs (`userId` not `id`)

---

## Application Context

**Expowiz** is a mobile-first, offline-capable web application for trade fair exhibitors to capture, organize, and manage business leads.

### Core Features

1. **Lead Capture**
   - Scan visiting cards (front/back)
   - Record voice notes
   - Add tags and categories
   - Attach files and documents

2. **Offline-First Architecture**
   - Full functionality without internet
   - Local storage via TinyBase in Web Worker
   - Automatic background sync when online
   - Real-time updates via SSE

3. **Team Collaboration**
   - Personal and team workspaces
   - Role-based access (Owner, Admin, User)
   - Shared lead visibility
   - Per-member subscription pricing

### Key Entities

- **Leads**: Business contacts captured at trade fairs
- **Teams**: Groups of users sharing leads
- **Tags**: Categorization system for leads
- **Subscriptions**: Time-based access with per-member pricing
- **Attachments**: Files and documents linked to leads

---

## Documentation Index

- **Development Plan**: [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) - Complete build specification
- **Backend Guidelines**: [apps/backend/AGENTS.md](apps/backend/AGENTS.md)
- **Frontend Guidelines**: [apps/frontend/AGENTS.md](apps/frontend/AGENTS.md)
- **Packages/UI Guidelines**: [packages/AGENTS.md](packages/AGENTS.md)
- **Zod Schemas Guidelines**: [packages/zod-schemas/AGENTS.md](packages/zod-schemas/AGENTS.md)

---

## Architecture Principles

> [!IMPORTANT]
> This project follows an **Offline-First** architecture. All data operations happen locally first, then sync to the cloud.

### Data Flow

```
User Action
    ↓
Data Worker (Web Worker)
    ↓
TinyBase (local store)
    ↓
SyncManager → Server (when online)
    ↓
SSE → Other clients (real-time)
```

### Workspace Model

- **Personal Workspace**: User's own leads
- **Team Workspace**: Shared leads with team members
- Users can switch between workspaces
- Each workspace has isolated data

### Permission Model

| Role | Create Leads | View All Leads | Edit Any Lead | Manage Team |
|------|-------------|----------------|---------------|-------------|
| Owner | ✓ | ✓ | ✓ | ✓ |
| Admin | ✓ | ✓ | ✓ | Partial |
| User | ✓ | View only | Own only | ✗ |

---

## Development Workflow

### Adding a New Feature

1. **Backend**
   - Create table in `apps/backend/src/modules/<feature>/tables/`
   - Create Zod schema in `packages/zod-schemas/src/<feature>.zod.ts`
   - Create router in `apps/backend/src/modules/<feature>/`
   - Generate migration: `yarn db g <migration_name>`
   - Register in `apps/backend/src/db/db.ts`

2. **Frontend**
   - Create module in `apps/frontend/src/modules/<feature>/`
   - Add pages, router, and components
   - Use Data Worker hooks for data operations
   - Add E2E tests

3. **Shared**
   - Build packages: `yarn build`
   - Type check: `yarn check-types`
   - Lint: `yarn lint`

### Database Changes

**CRITICAL**: Always auto-generate migrations
```bash
yarn db g <descriptive_name>
yarn db up
```

Migrations must be **backward compatible** - never drop columns in same deployment.

---

## Code Patterns

### Creating a Lead (Example)

**Backend** (`apps/backend/src/modules/leads/leads.router.ts`):
```typescript
export const createLead = rpcProtectedProcedure
  .input(leadCreateInputZod)
  .handler(async ({ input, context }) => {
    const lead = await db.leads.create({
      ...input,
      capturedByUserId: context.user.userId,
      createdAt: Date.now(),
    });
    
    // Broadcast to sync service
    syncService.push({
      type: 'leads',
      operation: 'create',
      data: lead
    });
    
    return lead;
  });
```

**Frontend** (`apps/frontend/src/modules/leads/pages/Capture.page.tsx`):
```typescript
const { mutate } = useWorkerMutation({
  mutationFn: async (leadData) => {
    // Worker handles local storage and sync
    return workerClient.createLead(leadData);
  }
});
```

---

## Testing Strategy

- **Unit Tests**: Vitest for backend logic
- **E2E Tests**: Playwright for frontend flows
- **Test Data**: Use fixtures in `packages/zod-schemas/src/*.fixture.ts`

---

## Deployment Notes

- Migrations run automatically on deployment
- Frontend served as static files
- Backend runs as Node.js service
- PostgreSQL with pg-tbus for events
- All changes logged to `pg_tbus_task_log`

---

**Last Updated**: February 2026  
**Version**: 3.0
