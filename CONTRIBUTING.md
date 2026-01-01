# Contributing to Connected Repo Starter - Journal App

## Development Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd connected-repo-starter-oRPC
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Set up environment variables**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Initialize database**
   ```bash
   cd apps/backend
   yarn db up
   ```

5. **Start development servers**
   ```bash
   yarn dev
   ```

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
- Feature branches: `feat/description`, `fix/description`, `chore/description`

### Commits
Use descriptive commit messages that clearly explain the changes made.

### Pull Requests
- Require CI passing
- At least 1 approval required
- No merge conflicts
- Include tests for new features

## Testing Requirements

- **Backend**: >80% coverage on routers and critical logic
- **Frontend**: >70% coverage on components and pages
- All PRs must include tests for new features

## Pre-commit Hooks

The project uses Git hooks to enforce code quality:

- **Pre-commit**: Runs Biome linting on staged files and type checking

Hooks are located in `.git/hooks/` and run automatically.

## Database

- Use Orchid ORM for database operations
- Run migrations: `cd apps/backend && yarn db g <name> && yarn db up`
- Follow snake_case naming for tables/columns

## Architecture

- **Backend**: oRPC with TypeScript, Orchid ORM, PostgreSQL
- **Frontend**: React 19, Material UI, TanStack Query
- **Auth**: Better Auth with Google OAuth
- **Validation**: Zod schemas

## Code Hygiene

- No unused variables, functions, or imports
- All code must pass Biome linting
- TypeScript strict mode enabled
- No `any` types allowed

## Need Help?

- Check existing code for patterns
- Read the [DEVELOPMENT_PLAN.md](./DEVELOPMENT_PLAN.md) for project roadmap
- Ask in GitHub Issues for clarification