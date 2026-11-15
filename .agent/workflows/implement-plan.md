---
description: How to sequentially implement atomic plans from .agent/plans
---

# Implement Plan Workflow

Follow these steps to implement the next scheduled atomic plan.

## Rules of engagement

- **One plan, one branch, one pull request, at most one new migration.** Plans in `.agent/plans/` are numbered in dependency order; always take the lowest number still present. Open the pull request as a draft against `main`, and delete the plan file in the pull request that completes it.
- **The repository's rules apply to every line**: Biome (tabs, 100 columns, double quotes); strict TypeScript with no `any`, `as unknown` or suppressions; direct imports, no barrels; `yarn db g <name>` for migrations, additive only; `AGENTS.md` files kept to their three-layer shape and updated when architecture moves; knip clean.
- **Gates before a pull request leaves draft**: `yarn build`, `yarn check-types`, `yarn lint`, `yarn knip`, `yarn test:db:setup && yarn test:run`, and the Playwright suite for user-facing changes.
- **Tests travel with the code**: every new router gets a backend test on the transaction harness (`apps/backend/src/test/setup.ts`); every new user-facing flow gets a Playwright spec.
- **Docs move with the code**: the plan names the `AGENTS.md`, `README.md` and `CHANGELOG.md` sections it touches; the root `AGENTS.md` "Active Task" layer names the plan in progress.
- **No database or Docker in the session?** Run what you can locally (`yarn build`, `yarn check-types`, `yarn lint`, `yarn knip`, unit tests); the tests that need Postgres or Redis and the e2e suite run in CI, which has both services. Do not block on them.
- **Never commit secrets.** `.env.example` files document every variable; CI uses the committed `.env.test` files.

1.  **Identify the Next Plan**:
    - Run `ls .agent/plans` to list all pending plans.
    - Pick the file with the lowest number (e.g., `001-ghost-blob-cleanup.md`).

2.  **Initialize Task**:
    - Read the content of the identified plan.
    - Call `task_boundary` with `TaskName` matching the plan's title (e.g., "Implementing Ghost Blob Cleanup").
    - Initialize/Update `task.md` with the items from the plan's "Proposed Strategy".

3.  **Execute & Verify**:
    - Implement the changes defined in the plan.
    - Follow the "Success Criteria" to verify the implementation.
    - If verification fails, fix the issues before proceeding.

4.  **Documentation Sync**:
    - Update the relevant `AGENTS.md` / `README.md` when the change affects architecture.

5.  **Completion & Cleanup**:
    - Once the work is verified and staged:
    - Run `/commit-staged` to commit the changes.
    - **Note**: The `/commit-staged` workflow is configured to automatically remove completed plan files. If not, manually delete the plan file from `.agent/plans` after the commit is successful.

6.  **Next Cycle**:
    - Repeat from Step 1 for the next numbered plan.
