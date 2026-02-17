---
name: agent-state-manager
description: High-precision lifecycle manager for Bimodal documentation. Enforces 3-layer AGENTS.md state, selective ADR indexing, and TS integrity. Use when managing project documentation, updating AGENTS.md files, creating new module-level contexts, or performing lifecycle transitions (Init, Conflict Gate, Archive & Pivot).
---

# Agent State & Documentation Manager

## Mission
Maintain `AGENTS.md` as the "Mirror of Truth" (Machine-centric) and `README.md` as the "Onboarding Map" (Human-centric). Use extreme brevity.

## Core Rules

### 1. Context Isolation (Creation Rule)
- **Folder-Specific Context**: Create new `AGENTS.md` files where functional isolation or technical complexity (e.g., sw, worker, or specific packages) requires dedicated LLM context.
- **Linkage**: Root `AGENTS.md` provides system-wide orchestration; nested files handle module-level execution.

### 2. Selective ADR Indexing
- **Threshold for Logging**: Create an ADR entry ONLY for major architectural shifts, breaking changes, or critical logic decisions (e.g., switching sync strategies).
- **Flood Control**: Do not log granular commit details or routine feature updates in `## 3. Decision Records`.
- **Format**: `[ID] | [Date] | [Context] -> [Decision] -> [Constraints]`

### 3. TypeScript & Data Integrity
- **The TS Vault**: Strictly maintain verbose TypeScript interfaces, generics, and constraints. LLMs must not "work around" types.
- **README Purpose**: Maintain project vision, unique offerings, and dev setup. Exclude environment variables (keep these in `.env.example` or internal docs).

## Lifecycle Phases

### Phase 1: Init
- **Audit**: Audit uncommitted changes (`git diff`) to populate `## 2. Active Task` with current ongoing intent.

### Phase 2: Conflict Gate
- **Validation**: If code deviates from Active Task, **STOP**. Force alignment before proceeding.

### Phase 3: Archive & Pivot
1. **Blueprint Sync**: Overwrite Blueprint with the new code reality.
2. **ADR Pivot**: If a major shift occurred, move the Active Task summary to Decision Records with a new incremental `[ADR-ID]`.
3. **README Update**: Update `README.md` for human-facing project milestones.

## Style Guidelines
- **Density**: High-density shorthand (e.g., `interface U {id:str}`).
- **Priority**: Grammar < Data/Context-Density.