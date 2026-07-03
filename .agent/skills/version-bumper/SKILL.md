---
name: version-bumper
description: Bump semver versions for the backend, frontend, and/or root package.json — independently or together — and append a matching CHANGELOG entry. Backend and frontend track separate versions.
---

# Version Bumper

Bumps the `version` field in one or more `package.json` files and appends a dated entry to the matching `CHANGELOG.md`. Backend and frontend are versioned independently; the root is a separate target.

## Invocation

The user invokes with: `<targets> <bump>`

- **targets** — comma-separated list of `backend`, `frontend`, `root`, or `all` (= backend + frontend + root).
- **bump** — one of `patch`, `minor`, `major`.

Examples:
- `backend patch` — 1.0.0 → 1.0.1 in `apps/backend/`
- `frontend minor` — 0.0.0 → 0.1.0 in `apps/frontend/`
- `backend,frontend patch` — bump both
- `all major` — bump backend, frontend, and root by major

If either arg is missing or ambiguous, ask before touching any file.

## Target → files

| Target     | package.json                       | CHANGELOG.md                     |
|------------|------------------------------------|----------------------------------|
| `backend`  | `apps/backend/package.json`        | `apps/backend/CHANGELOG.md`      |
| `frontend` | `apps/frontend/package.json`       | `apps/frontend/CHANGELOG.md`     |
| `root`     | `package.json` (repo root)         | `CHANGELOG.md` (repo root)       |

## Semver rules

Given current `MAJOR.MINOR.PATCH` (ignore any pre-release suffix — this skill does not support them):

- `patch` → `MAJOR.MINOR.(PATCH+1)`
- `minor` → `MAJOR.(MINOR+1).0`
- `major` → `(MAJOR+1).0.0`

If the current version doesn't match `X.Y.Z`, stop and surface the value to the user rather than guessing.

## Workflow

For each target, in order:

1. **Read** the target `package.json` and extract the current `version`.
2. **Compute** the new version per the semver rules above.
3. **Edit** the `version` field. Match the exact existing line (indented with a tab in this repo) so Edit succeeds:
   - Old: `\t"version": "1.0.0"`
   - New: `\t"version": "1.0.1"`
   Do not reformat the file. Preserve the trailing newline and every other field.
4. **Update the CHANGELOG**:
   - Use today's date from the `currentDate` context provided at session start (format `YYYY-MM-DD`). Do not run `date` or invent one.
   - Follow Keep-a-Changelog style. Insert the new entry **directly below** the `## [Unreleased]` heading if one exists, or at the top of the entries section otherwise.
   - Default entry template (empty bullet — the user fills in the summary):
     ```
     ## [<new-version>] - <YYYY-MM-DD>

     -
     ```
     Do not fabricate changelog content from git history unless the user explicitly asks (see below).
   - If `CHANGELOG.md` doesn't exist, create it with this scaffold:
     ```
     # Changelog

     All notable changes to this package are documented in this file.
     The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

     ## [Unreleased]

     ## [<new-version>] - <YYYY-MM-DD>

     -
     ```
5. **Report** each change as one line: `backend: 1.0.0 → 1.0.1 (patch)` — one per target, plus the CHANGELOG paths touched.

## Diff-based summaries (only on explicit request)

If the user explicitly asks to populate the CHANGELOG from the diff (e.g. "see diff vs main and add to changelog", "fill from git log"):

1. Run `git log --oneline main..HEAD` and `git diff --stat main...HEAD`. Do **not** pull the full diff — the stat plus commit subjects is enough to categorize.
2. Route each changed path to the matching target:
   - `apps/backend/**` → backend entry
   - `apps/frontend/**` → frontend entry
   - Everything else at the repo root (`.dockerignore`, root `Dockerfile`, root scripts, root configs) → root entry
   Only populate targets the user is actually bumping — do not invent entries for targets that were not in the invocation.
3. Group each target's entry under Keep-a-Changelog subsections `### Added`, `### Changed`, `### Fixed`. Use commit prefixes as a hint (`feat:` → Added, `fix:` → Fixed, `refactor:`/`chore:` → Changed) but let the actual paths override the guess when they disagree.
4. Write concise user-facing bullets. Do not paste raw commit hashes, full commit subjects, or file paths as bullets — summarize the behavior change instead. Reference file paths only when they identify a new artifact (e.g. "new `nginx.conf.template`").
5. Do not run `git add` or `git commit` — the guardrail below still applies.

## Guardrails

- **Never stage or commit.** Leave `git add`/`git commit` to the user. Do not run `git` at all.
- **Never touch versions in source code** (e.g. hardcoded OpenAPI `version: "1.0.0"` strings, Dexie DB versions, license-header text). Only the `version` field in `package.json`.
- **No cross-target coupling.** Bumping `backend` must not touch `frontend` or `root` unless the user included them in the target list. The whole point of this skill is that they version independently.
- **Idempotency.** If the user re-runs with the same args and the target `package.json` already reflects a fresh bump for today, prompt before adding a duplicate CHANGELOG entry.
- **Yarn workspaces.** This repo uses yarn workspaces (`workspaces: ["apps/*", "packages/*"]`). Package versions here are internal — no publish step is triggered. Do not run `yarn install` after the bump.
