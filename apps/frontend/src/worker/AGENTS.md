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
  3. Team-wipe drain (tombstones detected during the pull), then the
     push pipeline: `pushJournalEntryCreates` then `pushFileCdnUpdates`.
  Push runs AFTER the pull + wipe (serialised, not parallel) so we never
  push mutations for a team the user was just removed from.
  Cursors are per-`(table, teamId)`. Team-switch drift is handled at the
  ORPC link boundary by `switchGate`; the cycle also re-checks the active
  team at start and aborts if it flipped.
- **Trigger sources inside the worker**:
  - Dexie `subscribe()` DB-write callback (post-write kick).
  - `self.addEventListener("online", ...)`.
  - 120s interval safety net.
  Additional triggers arrive from the main thread via `sync-triggers.ts`
  (`visibilitychange`, `focus`, `online`, 120s interval, post-mutation kicks)
  and from an FCM silent push relayed by the service worker.
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
The DataWorker talks to the MediaWorker over a **direct `MessageChannel`**, not
through the main thread. At startup the main thread creates one channel and
brokers a port to each side: it posts `{ __connectMediaPort }` to the
MediaWorker (which `Comlink.expose`s its API on that port) and hands the other
port to the DataWorker via `connectMediaPort` (which `Comlink.wrap`s it into
`worker.context.ts`'s `ProxyCell`). `FileUploadWorker` then calls
`generateThumbnail` worker-to-worker — neither the call nor the file blob
round-trips through main. A sync trigger arriving before wiring completes pends
on the `ProxyCell` instead of crashing. The MediaWorker still exposes the same
API on its default endpoint for main-thread callers (SmartMediaUploader, the
active-team seed).

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

## Membership revocation (Q6 — fixed)

"You were removed from a team → wipe that team's local data" is handled by
`SyncOrchestrator.reconcileMemberships`, which runs FIRST in every cycle and
calls the **session-only** `teams.listMyActiveTeamIds` endpoint. It diffs the
teams the user is currently an active member of against the teams mirrored
locally and wipes the difference. Because it's session-only it works even when
the user was removed from their active team (the active-team-scoped anchor
would 403), and because it reconciles against *current* membership rather than
a tombstone it can't loop on re-invite. Rationale + the pure diff helper live
in `sync/membership_reconciliation.ts`.
