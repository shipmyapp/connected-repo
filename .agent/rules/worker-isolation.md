---
trigger: always_on
---

## Worker Isolation & Proxy Pattern

To maintain a responsive UI and clean architecture, we strictly separate UI logic from data and media processing.

1. **Worker Segmentation**:
   - `DataWorker`: Handles stateful operations, Dexie.js database interactions, and sync logic.
   - `MediaWorker`: Handles stateless operations like image processing, compression, and uploads.
2. **NO Direct Instantiation**: Workers MUST NOT be instantiated directly in React components. This leads to redundant worker threads and memory leaks.
3. **Proxy Pattern**: Use the established proxy pattern to interact with workers. 
   - UI components should call `getDataProxy()` or `getMediaProxy()` to get a Comlink-wrapped instance of the worker.
4. **Offline Safety**: DataWorker is the source of truth for offline data. Ensure all UI updates that depend on persistent state flow through the DataWorker proxy.