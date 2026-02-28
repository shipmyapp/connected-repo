# Plan: Background Sync (Service Worker) (011)

## Objective
Enable the application to synchronize pending data in the background using the W3C Background Sync API, ensuring data reaches the server even if the user closes the app or the tab.

## Context
Currently, sync triggers are primary driven by foreground activity or explicit user actions. Periodic background sync allows the OS to wake up the Service Worker when connectivity is restored to process the pending queue.

## Proposed Strategy

### 1. Isomorphic Sync Engine
- **Constraint**: Service Workers (SW) cannot "wake up" the Data Web Worker if it has been terminated.
- **Solution**: Refactor `SyncOrchestrator` into a core class that can be instantiated by **both** the DataWorker and the Service Worker.
- **Environment Awareness**: The engine must detect its environment (DataWorker vs. SW) to decide if it can perform heavy/DOM-dependent tasks like thumbnail generation (Canvas-based).

### 2. Selective Synchronization (SW Context)
- In the SW context, the engine will focus on:
    - **Metadata Sync**: Pushing JSON data to the backend via oRPC.
    - **Original File Uploads**: Sending blobs from OPFS to the CDN via standard `fetch`.
- It will **defer** thumbnail generation (which requires Canvas) until the app is opened and the DataWorker/Main thread is active.

### 3. Background Sync Registration
- Register a sync tag (e.g., `'sync-pending-data'`) whenever new pending data is added to IndexedDB.
- Handle the `sync` event in the Service Worker and call `syncOrchestrator.processQueue()` directly in the SW.

## Implementation Steps
1. **Refactor `SyncOrchestrator`**: Ensure it and its dependencies (oRPC, Dexie managers) are "Universal" (safe for SW and WebWorker). Avoid dynamic `import()` in the core path.
2. **Context Injection**: Allow `SyncOrchestrator` to accept a `capabilities` object or detect `globalThis.ServiceWorkerGlobalScope`.
3. **SW Integration**: Import the orchestrator into `sw.ts` and instantiate it.
4. **Queue Heartbeat**: Ensure the SW correctly waits for the sync to complete (`event.waitUntil`).

## Success Criteria
- `'sync-pending-data'` tag is successfully registered.
- Service Worker can process the sync queue independently of the DataWorker.
- Metadata and original files sync even when the app is "closed".
