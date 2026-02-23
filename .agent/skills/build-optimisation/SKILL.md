---
name: build-optimisation
description: Specialized skill for advanced code chunking, performance optimization, and true offline-first caching for the teziapp project. Use when the user wants to speed up the app load (Login, Homepage), optimize Vite/Bundler configurations, or implement background pre-caching.
---

# Skill: Intelligent Code Chunking & Performance Optimization

## Phase 0: Diagnostic Gate & Validation Loop

**STOP:** Before proposing changes, you must request and analyze:

1. **The `.har` file:** To identify "Long Tasks" and blocking resources on Login and `/leads/create`.
2. **The `stats.json` file:** Located at `apps/frontend/dist/.dev/stats.json`.
* **The "Ultra-Light" Audit:** Verify Login and Homepage chunks contain **zero** references to Dexie, heavy UI kits, or unused libraries.
* **Tree-Shaking Verification:** Check for "Barrel File" leaks. If an internal package is pulling in unused code, force atomic imports.
* **Duplication Check:** If the same library is bundled into multiple routes, **only then** propose a shared library-level chunk.
* **Reiteration:** You must reiterate through the build logic until the bundle metrics match the priorities below. Do not provide a final solution until the "Ultra-Light" and "Zero Duplication" goals are demonstrably achieved.



## Core Parameters (Priority Order)

1. **Login Page Load:** Extremely quick. (Ultra-light, no 50KB floor).
2. **Homepage:** Extremely quick following login.
3. **True Offline-First:** Systematic full-app caching in background.

## Implementation Rules

### 1. Deep Tree-Shaking (Internal & External)

* **Atomic Imports:** Forbid the use of "Barrel Files" (index.ts re-exports) in critical paths. Force direct file imports (e.g., `import { X } from '@teziapp/utils/X'`) to ensure the bundler can fully drop unused code.
* **Side-Effect Optimization:** Ensure all internal monorepo packages are marked as `sideEffects: false` in their respective `package.json` to allow aggressive dead-code elimination.
* **Library-Level Chunking:** Only group libraries into a shared chunk if they appear in 3+ routes. Otherwise, keep them dynamically coupled to the specific route that needs them.

### 2. Dynamic Route/Component Chunking

* **Default State:** Use **Module-Level Dynamic Imports** (`React.lazy`, `import()`) for everything outside the Login critical path.
* **Sustained Performance:** Keep dependencies isolated to the route chunks to avoid "bundle gravity" (where one large chunk slows down the whole app).

### 3. Staggered Priority

* **Priority 1 (Critical):** Core UI (HTML/CSS/Minimal JS) for the active route.
* **Priority 2 (Interactivity):** Auth logic and event listeners.
* **Priority 3 (Background):** Booting Data (Dexie), Media-processing, and SW threads.

### 4. Thread & Boundary Integrity

* **Isolation:** Code for Dexie, Media, or SW threads must be strictly isolated. No cross-contamination with the UI main thread chunk.

### 5. Predictive & Sequential Pre-caching

* **Tier A (Post-TTI):** Immediately pre-fetch Homepage once Login is interactive.
* **Tier B (Sequential Full-Sync):** Once critical routes are cached, cache the rest of the app one-by-one.

### 6. Adaptive Sync & Handshake

* **Idle-Time Execution:** Use `requestIdleCallback` for background sync.
* **Safe Invalidation:** Use a "Version Handshake." Do not force reload if a Worker or Dexie transaction is active.

### 7. Persistent Documentation

* **Mandatory Comments:** Every optimization must include a code comment (e.g., `// OPTIMIZATION: [Reason]`) explaining the logic for future LLM context.

### 8. General Chunk Size Logic

* Target ~50KB minimum for non-critical routes. Ignore this for Login/Critical paths.