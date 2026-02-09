# Monorepo Agent Guidelines

## Quick Reference

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

## Detailed Guidelines

**Backend (oRPC + Orchid ORM + pg-tbus):**
- See [apps/backend/AGENTS.md](apps/backend/AGENTS.md)
- Database tables, migrations, oRPC endpoints, events, cron jobs, testing

**Frontend (React 19 + Vite + TanStack Query + PWA):**
- See [apps/frontend/AGENTS.md](apps/frontend/AGENTS.md)
- React patterns, oRPC client, PWA features, offline-first, workers, E2E testing, UI design

**Packages:**
- See [packages/AGENTS.md](packages/AGENTS.md)
- Package architecture, no barrel exports, tree-shaking

**UI Components:**
- See [packages/ui-mui/AGENTS.md](packages/ui-mui/AGENTS.md)
- Material-UI components, RHF wrappers, responsive design

**Validation Schemas:**
- See [packages/zod-schemas/AGENTS.md](packages/zod-schemas/AGENTS.md)
- Entity schemas, validators, shared types
