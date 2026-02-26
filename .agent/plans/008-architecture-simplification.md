# Plan: Architecture Simplification (008)

## Objective
Reduce boilerplate and improve maintainability by centralizing worker proxies and automating context scoping.

## Proposed Strategy
1. **Centralized Proxy**: Create `useWorkerApp()` hook to memoize Comlink proxy.
2. **Implicit Scoping**: Update `DbManager` to maintain `activeTeamId` and automatically apply it to queries.
3. **View Logic Extraction**: Move media mapping logic from Pages into `FilesDBManager.getAttachments()`.

## Success Criteria
- UI components contain less worker-resolution boilerplate.
- Database calls no longer require explicit `teamId` in standard scenarios.
