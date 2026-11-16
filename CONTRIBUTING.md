# Contributing to Connected Repo

## Development Setup

Prerequisites: Node 26 (`engines.node` `>=26`, `.nvmrc`), Yarn 1.22.22, PostgreSQL 18 and Redis 8 (or Docker, which runs both: `docker compose -f docker-compose.dev.yml up postgres redis`). The README's "Getting Started" has the one-command Docker stack too.

1. **Clone the repository**
   ```bash
   git clone git@github.com:shipmyapp/connected-repo.git
   cd connected-repo
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp apps/backend/.env.example apps/backend/.env
   cp apps/frontend/.env.example apps/frontend/.env
   cp apps/superadmin/.env.example apps/superadmin/.env
   # Edit them with your configuration
   ```

4. **Initialize database**
   ```bash
   yarn build
   yarn db create && yarn db up && yarn db seed
   yarn test:db:setup
   ```

5. **Start development servers**
   ```bash
   yarn dev   # backend :3000, frontend :5173, console :5175
   ```

## Editor Setup

The repository's TypeScript is 7, the native compiler. It ships `tsc` and a language server (`tsc --lsp --stdio`), but not the JavaScript language-service API that editors built on TypeScript 5 load from a workspace's `node_modules`.

- **VS Code**: install Microsoft's "TypeScript 7" extension (`TypeScriptTeam.native-preview`) and turn it on (`"js/ts.experimental.useTsgo": true`, or the command "TypeScript: Enable TypeScript 7"), or keep the editor's bundled TypeScript; do not pick "Use Workspace Version", which looks for a TypeScript 5-style `tsserver` this package does not have.
- **Other editors** (Neovim, Zed, JetBrains, Helix): point the TypeScript language-server client at `node_modules/.bin/tsc --lsp --stdio`.
- Biome (formatting and lint) is unaffected; its VS Code extension is the default formatter (`.vscode/settings.json`).

`yarn check-types` is the source of truth either way.

## Code Style Guidelines

- **Formatting**: Tabs (NOT spaces), 100 char line width, double quotes
- **Types**: NO `any` or `as unknown` - use strict TypeScript
- **Imports**: Direct imports from packages (e.g., `import { Button } from '@connected-repo/ui-mui/form/Button'`), NO barrel exports/index files
- **Naming**:
  - camelCase for code
  - snake_case for database tables/columns
  - Descriptive IDs (`userId` not `id`, `authorUserId` not `authorId`)
- **Error Handling**: Throw standard errors - centralized error formatter handles conversion to HTTP responses
- **Comments**: Avoid unless necessary for complex logic

## Git Workflow

### Branches
- `main`: Production branch
- `develop`: Staging branch (if used)
- Feature branches: one per atomic plan in `.agent/plans/`, `feat/description`, `fix/description`, `chore/description`

### Commits
Small commits in the conventional style: `feat(pwa): …`, `fix(auth): …`, `chore(ci): …`, `docs: …`, `test: …`. The message says what changed and why, in the template's own terms. Never commit secrets, `.env` files, `node_modules`, `dist` or database dumps.

### Before you push
Run the gate; CI runs the same steps:
```bash
yarn install --frozen-lockfile
yarn build
yarn check-types
yarn lint
yarn knip
yarn workspace @connected-repo/backend check:openapi   # after a user-app router or schema change: NODE_ENV=test yarn workspace @connected-repo/backend gen:openapi
yarn test:db:setup && yarn test:run                    # needs Postgres and Redis
yarn test:e2e:with-build                               # Playwright (chromium)
yarn check:deploy
yarn check:sentry                                      # after yarn build
```
A migration also needs `yarn db g check_no_drift` to write nothing (delete what it writes).

### Pull Requests
- One plan, one pull request, at most one new migration file
- Require CI passing
- At least 1 approval required
- No merge conflicts
- Include tests for new features

## Testing Requirements

- **Backend**: every router has a Vitest test on the transaction harness (`apps/backend/src/test/setup.ts`)
- **Frontend**: every user-facing flow has a Playwright spec (desktop and mobile projects in `apps/frontend/playwright.config.ts`)
- All PRs must include tests for new features

## Pre-commit Hooks

`yarn install` sets `git config core.hooksPath .githooks`:

- **pre-commit**: Biome on the staged files (format and lint; unused imports and variables are errors)
- **pre-push**: `yarn knip` (unused files, exports, types, dependencies) and `yarn check-types`

CI runs knip and lint again. Do not skip a hook with `--no-verify`.

## Database

- Use Orchid ORM for database operations
- Run migrations: `cd apps/backend && yarn db g <name> && yarn db up`
- Additive, backward-compatible migrations only; follow snake_case naming for tables/columns

## Architecture

- **Backend**: oRPC with TypeScript, Orchid ORM, PostgreSQL, Redis, pg-tbus, Novu, Sentry 11
- **Frontend**: React 19, Material UI, TanStack Query, Dexie (offline-first), Vite PWA, Sentry 11
- **Console**: `apps/superadmin`, the operator console (no Sentry)
- **Auth**: Better Auth with Google and Apple sign-in, bearer tokens for the mobile app; email + password only in tests
- **Validation**: Zod schemas

## Code Hygiene

- No unused variables, functions, or imports (`yarn lint` and `yarn knip` are clean)
- All code must pass Biome linting
- TypeScript strict mode enabled
- No `any` types allowed

## Need Help?

- Check existing code for patterns
- Read [README.md](./README.md) and the per-module `AGENTS.md` files for architecture
- Ask in GitHub Issues for clarification