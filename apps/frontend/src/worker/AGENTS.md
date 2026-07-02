# Web Worker Architecture

The frontend runs **two dedicated web workers**, both exposed to the main thread
via Comlink through `worker.proxy.ts` (`getDataProxy()`, `getMediaProxy()`). The
main thread never spawns workers elsewhere.

## DataWorker (`data.worker.ts`)
Stateful. Owns the per-user Dexie DB and the sync engine.

- **DB**: `initDb(userId)` opens `dbNameFor(userId)` and drops any other user's
  DB on this device. Module DB adapters (`journal-entries`, `prompts`,
  `teamsApp`, `teamMembers`, `files`, `syncMetadata`) throw until this
  completes.
- **SyncOrchestrator** (`sync/sync.orchestrator.ts`): pull-delta protocol per
  table with a wave-1 anchor:
  1. `teamsApp` (anchor — mints `topLevelSyncedAt`) →
  2. `teamMembers` → `prompts` → `journalEntries` → `files` (pull pipeline).
  3. Push pipeline (parallel with pull): `pushJournalEntryCreates` then
     `pushFileCdnUpdates`.
  Cursors are per-`(table, teamId)`. Cycles capture `expectedUserId` +
  `expectedTeamId` and abort writes if either flips mid-cycle to protect the
  old team's cursor.
- **Trigger sources inside the worker**:
  - Dexie `subscribe()` DB-write callback (post-write kick).
  - `self.addEventListener("online", ...)`.
  - 60s interval safety net.
  Additional triggers arrive from the main thread via `sync-triggers.ts`
  (`visibilitychange`, `focus`, `online`, 60s interval, post-mutation kicks).
- **FileUploadWorker** (`sync/file_upload.worker.ts`): sole CDN upload
  path — both online-picked and offline-picked files go through
  `filesDb.upsertLocal` (which writes the blob to OPFS) and are drained
  here. Per-layer state machine (`main` + `thumbnail`) reads blobs from
  OPFS, hands the source blob to the MediaWorker only for thumbnail
  *generation*, and PUT-s to the CDN via presigned URLs directly in the
  DataWorker realm (no Comlink hop for the raw bytes). Retries with
  backoff `[1, 2, 4, 8, 16]s`, max 5 attempts, `MAX_CONCURRENT = 3`.
  Runs alongside every sync cycle.
- **Active-team cache** (`sync/active_team.ts`): pushed in from the main
  thread; used by the ORPC client's `x-team-id` header hook. No `x-team-id` =
  backend rejects with "Active team id mismatch."

## MediaWorker (`media.worker.ts`)
Stateless. Off-main-thread media processing (no CDN networking).

- Image thumbnail generation (`browser-image-compression`).
- PDF thumbnail rendering (`pdfjs-dist`).
- Returns derived thumbnail Blobs to the caller — never persists, never
  uploads. The DataWorker's `FileUploadWorker` handles the actual PUT
  to the CDN so raw source blobs never cross a Comlink boundary.
- Has its OWN copy of `active_team.ts` (separate realm), seeded by the main
  thread on spawn and on team switch. `getMediaProxy()` awaits the seed before
  resolving so any future RPC out of this worker starts with the right
  `x-team-id`.

Video thumbnails still run on the main thread (`utils/thumbnail-video-ui.ts`)
because `VideoDecoder` / `<video>` require a DOM-backed runtime.

## Cross-worker bridge
The main thread bridges the MediaWorker proxy into the DataWorker via
`dataProxy.setMediaProxy(...)`. Inside the DataWorker, `worker.context.ts`
holds this proxy in a `ProxyCell` — the `FileUploadWorker` awaits it
only for thumbnail generation (the CDN PUT itself is direct, in the
DataWorker realm). A sync trigger arriving before wiring completes
pends instead of crashing.

## Lifecycle
- Main thread instantiates both workers lazily on first `getDataProxy()` /
  `getMediaProxy()`.
- Login → `initSyncForUser(userId, activeTeamAppId)` (in `utils/sync-triggers.ts`)
  → seeds the header cache, opens the per-user DB, seeds the active team,
  installs main-thread triggers.
- Logout → workers stay alive (same-user re-login is instant); active team
  cleared everywhere.
- `tearDownSync()` (tests / hard reset) → `terminateWorkers()`; the on-disk
  Dexie DB is preserved.
