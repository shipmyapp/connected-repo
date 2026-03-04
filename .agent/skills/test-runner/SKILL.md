---
name: test-runner
description: Automated test runner and failure resolver. Use this skill to run builds and tests (e2e, unit) in the monorepo, following strict best practices for resolution.
---

# Test Runner Skill

Use this skill to run tests and resolve failures efficiently across the monorepo.

## Workflow

### 1. Pre-test Build & Setup
Always ensure the environment and database are ready. Because `pg-tbus` handles its own schema initialization on server start, you MUST run the test server briefly to create its tables after a DB reset:

1. Build packages:
```bash
yarn run test:build
```

2. Initialize tbus schema for DB testing (Run this briefly then kill it, or wait for it to be ready):
```bash
cd apps/backend && yarn run test:server:start
```

### 2. Execution Order
Tests MUST be executed in this sequence. Do not proceed to the next stage if the current one fails:
1.  **Backend Tests**: `cd apps/backend && yarn run test`
2.  **E2E Tests**: `cd apps/frontend && yarn run test:e2e`
3.  **Multi-Context Sync Tests**: For modules using `SyncOrchestrator` or SSE, verify real-time data travel across multiple browser contexts using Playwright `browserContext`.

### 3. Investigation Protocol (Root Cause Over Test Band-aids)
When a test fails, DO NOT simply "fix the test". You MUST identify and resolve the root cause in the source code:
1.  **Isolate & Verify**: Run the specific failing test in isolation using `yarn run test:e2e -g "<test-title>"`.
    - If it passes in isolation but fails in parallel, the issue is likely **interference** (shared state, database conflicts, or race conditions).
    - Solve for the specific parallel/interference issue rather than adding timeouts.
2.  **Isolate & Log**: Use `.log()` or `.toSQL().sql` on Orchid ORM queries to inspect generated SQL.
3.  **Syntax Check**: Look for invalid SQL patterns (e.g., misplaced `WHERE` clauses).
4.  **Environment Check**: Verify `IS_E2E_TEST` and `NODE_ENV` are correctly set in the test environment.
5.  **Error Resolution Protocol**: Errors MUST be resolved one by one. DO NOT attempt to solve all failures at once. Fix one test case, verify it passes, then move to the next.
6.  **OOM Awareness**: SQL syntax errors in test transactions often manifest as "JavaScript heap out of memory".

## Strict Guidelines
- **Fix Source, Not Test**: Tests are markers of truth. If they fail, the implementation is likely wrong or incompatible.
- **Minimal & Non-Exhaustive**: Focus on the "happy path" and straightforward cases for future compatibility. We want to ensure new changes don't break established core logic.
- **NO Anti-patterns**: Never use suppressed errors or arbitrary timeouts.
- **Independence & Concurrency**: Use helper functions imported and run in setup hooks (`beforeEach`, `afterEach`) instead of manual workarounds. This ensures tests are independent and can be executed concurrently in parallel.

## Known Bug Context & Protocol
> [!IMPORTANT]
> **Orchid ORM conflict**: `onConflictDoNothing()` used with `softDelete: true` generates invalid SQL (misplaced `WHERE` clause), causing memory exhaustion (OOM). 
> **Protocol**:
> - In standard tests (`isTest && !env.IS_E2E_TEST`), `softDelete` must be set to `false`.
> - Always pass `IS_E2E_TEST=false` in Vitest scripts via `cross-env`.
