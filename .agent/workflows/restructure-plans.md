---
description: How to review and restructure plans to be atomic and properly stacked
---

# Restructure Plans Workflow

Use this workflow to re-organize the development roadmap when new requirements emerge or when plans become non-atomic.

1.  **Inventory Existing Plans**:
    - Run `ls .agent/plans` to list all current plan files.
    - Read the content of every plan to identify overlapping scopes or broken dependencies.

2.  **Atomize & Stack**:
    - Ensure each plan addresses exactly ONE technical objective.
    - If a plan is too large, split it into sequential parts (e.g., `Part 1: Backend`, `Part 2: UI`).
    - Audit dependencies: A plan must not depend on a future-numbered plan.

3.  **Define Logical Sequence**:
    Follow this standard prioritization hierarchy:
    - **Stability (001-002)**: Immediate bug fixes, storage protection, or infra stability.
    - **Reliability (003-005)**: Telemetry, error handling, and data safety (bytea fallbacks).
    - **Functionality (006-007)**: New features and user-facing capabilities.
    - **Optimization (008-009)**: Refactors, architecture simplification, and performance.
    - **Resiliency (010+)**: Self-healing checks and disaster recovery.

4.  **Propose Changes**:
    - Create an `implementation_plan.md` documenting the new sequence and any splits/merges.
    - List the exact renames (e.g., `004-old.md` -> `001-new.md`).

5.  **Execute Transformation**:
    - Rename the files on disk.
    - Update the internal `# Plan: Title (NNN)` in each file to match the new filename.
    - Remove redundant or completed plans.

6.  **Update Master Docs**:
    - Update the relevant `AGENTS.md` / `README.md` with the new intent where architecture changed.
