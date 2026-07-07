---
description: How to sequentially implement atomic plans from .agent/plans
---

# Implement Plan Workflow

Follow these steps to implement the next scheduled atomic plan.

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
