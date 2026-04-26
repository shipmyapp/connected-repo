# Database Migrations Rule

This rule ensures the database schema remains clean, linear, and debuggable by enforcing strict Orchid ORM practices.

## Core Rules

1.  **CLI Generation Only**: NEVER create migration files by hand. 
    - Use `yarn db g <migration-name>` to generate migrations from the backend directory.
    - Example: `yarn db g add_user_handle_to_users`
2.  **Single Migration Per PR**: Every Pull Request MUST contain **exactly one** migration file when checked against the `main` branch.
    - If multiple migrations were created during development, they MUST be squashed/consolidated into a single file before merging.
    - The migration file should reflect the final state of the schema changes in that PR.
3.  **Backward Compatibility**: Migrations must be non-breaking whenever possible.
    - Add nullable columns or columns with defaults.
    - Two-step deletion: Mark as unused in one PR, drop in a later release.
    - Never rename columns in a single deployment if it breaks high-availability.

## Enforcement in Code Review

- **Check**: Run `ls apps/backend/src/db/migrations/` and compare with `main`.
- **Verdict**: If >1 new migration file exists, reject the PR and request a squash.
- **Verdict**: If migration files contain manually written raw SQL for logic that can be handled by `rake-db` (Orchid ORM), request refactoring.

## Rationale
- Prevents "migration hell" where developers step on each other's toes with overlapping migration numbers.
- Simplifies rollback procedures and ensures that a PR is a single logical unit of change.
