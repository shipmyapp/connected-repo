# Code Quality & Architecture Standards

This rule enforces a "CTO-level" standard: Production-ready code that is exceptionally simple to read and maintain.

## Core Principles

1.  **Skimmable Logic**: Optimize for the reader's eye.
    -   Use **Early Returns** to eliminate deep nesting.
    -   Avoid "clever" one-liners. Clarity > Cleverness.
    -   Keep functions short and focused on a single responsibility.
2.  **Strict TypeScript (Non-Negotiable)**:
    -   ZERO `any` or `as unknown`.
    -   Infer types wherever possible; explicitly type complex return objects.
    -   Use Zod schemas as the source of truth for all data boundaries (API, DB, Forms).
3.  **Zero-Debt API (oRPC Parity)**:
    -   Frontend models MUST stay in sync with Backend Zod schemas.
    -   Every route exposed via `open_api.router.ts` MUST have an explicit `.output()` schema defined. This ensures the OpenAPI spec is fully typed and client generation (oRPC/Swagger) works reliably.
4.  **React 19 & MUI Standards**:
    -   Minimize `useEffect`. Use `use()`, `useTransition`, and `Suspense` for data fetching and state transitions.
    -   Enforce Material-UI (MUI) semantic tokens for all styling. No hardcoded hex codes.
    -   Lazy load all routes and heavy components.

## Backend Specifics (Node.js/Orchid ORM)

1.  **Module Isolation**: Keep logic within `src/modules/<module-name>`. Cross-module imports are allowed only for truly shared utilities.
2.  **Procedure Safety**: Use the appropriate oRPC procedure (`rpcProtectedProcedure` vs `rpcPublicProcedure`) for every endpoint.
3.  **Event-Driven**: Favor pg-tbus events over complex, synchronous multi-table writes when immediate consistency is not required.

## Enforcement in Code Review

- **Readability**: If a function takes more than 10 seconds to "get", it's too complex. Request refactor.
- **Standards**: Check for manual `any` casts or hardcoded styling.
- **Architecture**: Ensure new features follow the established module structure.
