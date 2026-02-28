---
description: Semantic commit with integrated review and documentation lifecycle sync.
---

# Semantic Commit Workflow

Follow these steps to safely commit staged changes while maintaining documentation integrity.

1. **Review Staged Changes**:
   - Run the `/review-staged` workflow.
   - Present findings to the user and wait for approval/refactoring.

2. **Update Documentation**:
   - After user approval of the code, use the `agent-state-manager` skill to update relevant documentation.
   - Sync `DEVELOPMENT_PLAN.md` (mark tasks done/update approach).
   - Sync `AGENTS.md` (Update `Active Task`, add `Decision Records` if major).
   - `git add DEVELOPMENT_PLAN.md AGENTS.md` (and any other updated docs).

3. **Write Minimal & Non-Exhaustive Tests**:
   - For any new or modified router, add a basic test case in the corresponding backend test file.
   - For significant UI changes, add a basic E2E test in the frontend.
   - **Goal**: Ensure future compatibility and catch regressions in straightforward cases. DO NOT aim for 100% coverage here.
   - Follow the `test-runner` skill protocol: Run backend tests first, then E2E.
   - `git add` any new/modified test files.

4. **Verify Tests Pass**:
   - Ensure all backend and relevant E2E tests pass before moving on.
   - If tests fail, investigate the root cause using the `test-runner` protocol. Resolve failures **one by one**, verifying each fix before proceeding to the next.

5. **Check for Plan Completion**:
   - Review existing plans in `.agent/plans/`.
   - If any plan is fully implemented by the current changes, delete the plan file.
   - Update `DEVELOPMENT_PLAN.md` to reflect the completion if necessary.

6. **Stage Workflow Changes**:
   - Ensure all changes made during the workflow (documentation, tests, plan deletions) are staged.
   - Run: `git add .` (or specific items to ensure local state matches the intent).

7. **Generate Commit Message**:
   - Analyze context from `git diff --staged -- . ':!package-lock.json' ':!yarn.lock' ':!pnpm-lock.yaml'`.
   - Draft a SEMANTIC commit message based on `.opencode/command/commit.md` (if exists) or standard conventional commits:
     - Header: `<type>(<scope>): <short description>`
     - Body: Multiple bullet points for details.
     - **CRITICAL**: Use actual newlines in your draft, but when executing the command, provide the header and each bullet point (or the whole body) as separate `-m` arguments. 
     - No literal `\n` characters in the final command.
     - Grammar < Brevity.
     - No quotes/backticks in the message content itself.

8. **Execute Commit**:
   - Run: `git commit -m "HEADER" -m "BODY_LINE_1" -m "BODY_LINE_2" ...`

9. **Cleanup**:
   - Ensure temporary context files are removed.