# Monorepo Agent Guidelines

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

## Documentation Index

- **Architecture Deep-Dive**: [SYNC_ARCHITECTURE.md](./docs/SYNC_ARCHITECTURE.md)
- **Backend Guidelines**: [apps/backend/AGENTS.md](apps/backend/AGENTS.md)
- **Frontend Guidelines**: [apps/frontend/AGENTS.md](apps/frontend/AGENTS.md)
- **Packages/UI Guidelines**: [packages/AGENTS.md](packages/AGENTS.md)
- **Zod Schemas Guidelines**: [packages/zod-schemas/AGENTS.md](packages/zod-schemas/AGENTS.md)

---

> [!TIP]
> This project follows an **Offline-First** architecture. Always prioritize data consistency and reactive UI patterns. See the sub-component guidelines for implementation details.
