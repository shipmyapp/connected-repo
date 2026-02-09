# Frontend Agent Guidelines

## Stack
React 19, Vite 7, React Router 7, TanStack Query + oRPC, React Hook Form, Zustand, Dexie.js (IndexedDB), Material-UI, Better Auth, Sentry, Vite PWA

## Structure
```
src/
├── modules/          # Feature modules
│   └── <module>/
│       ├── pages/          # Module pages
│       ├── <module>.router.tsx  # Routes
│       └── <module>.spec.ts     # E2E tests
├── worker/           # Web Workers (DataWorker + MediaWorker)
│   ├── db/           # Dexie.js IndexedDB
│   ├── cdn/          # CDN upload manager
│   ├── sync/         # Delta sync orchestrator
│   ├── data.worker.ts
│   └── media.worker.ts
├── sw/               # Service Worker (SSE sync)
├── components/       # Shared (pwa/, layout/)
├── utils/           # oRPC client, auth, query client
├── configs/         # Environment config
├── router.tsx       # Main routes
└── main.tsx         # Entry
```

## Module Rules
- Self-contained with own pages, routes, logic
- NO cross-module imports
- Lazy load pages: `const Page = lazy(() => import('./pages/Page.page'))`

## Workers (CRITICAL)

**Two-Worker Architecture via Comlink:**

```
UI Thread (React)
  ├─► DataWorker (Dexie DB, Sync, SSE)
  └─► MediaWorker (CDN uploads, thumbnails, exports)
```

**Usage**:
```typescript
// UI Components
import { getDataProxy } from '@/worker/worker.proxy';
const data = await getDataProxy().journalEntriesDb.getAll();

// Workers can call each other via setMediaProxy/setDataProxy
```

**DataWorker**: IndexedDB access, SyncOrchestrator, SSE subscriptions  
**MediaWorker**: Stateless, image/video/PDF thumbnails, CDN uploads, CSV/PDF exports

## Offline-First Architecture

**Dexie.js Tables**:
- `journalEntries`: Synced data from server
- `pendingSyncJournalEntries`: Local changes awaiting sync
- `files`: Blob storage for attachments
- `teamsApp`, `teamMembers`: Team data

**Reactive Hooks** (`worker/db/hooks/useLocalDb.ts`):
```typescript
const entries = useLocalDb({
  table: 'journalEntries',
  filter: (entry) => !entry.deletedAt,
  sort: { key: 'createdAt', direction: 'desc' }
});
```

**Local DB Manager** (`worker/db/journal-entries.db.ts`):
```typescript
export const journalEntriesDb = {
  async create(input) { /* add to pending queue */ },
  async delete(id) { /* mark deleted locally */ },
  async getAll() { /* query IndexedDB */ }
};
```

## Delta Sync

**Service Worker SSE** (`sw/sse/sse.manager.sw.ts`):
- Connects on login, disconnects on logout
- Receives delta chunks on connect
- Real-time updates via ORM hooks
- Heartbeat every 10s for connectivity

**Status**: `connecting` | `connected` | `sync-complete` | `sync-error`

## Offline Auth Caching

**Pattern**: Cache session in localStorage for offline fallback

```typescript
import { saveAuthCache, getAuthCache, clearAuthCache } from '@/utils/auth.persistence';

// Save on successful auth
saveAuthCache(session.user);

// Clear on logout
await signout("clear-cache");
```

## File Uploads (CDN)

**Presigned URL Pattern** (`worker/cdn/cdn.manager.ts`):
```typescript
// 1. Get presigned URLs from backend
const urls = await orpcFetch.cdn.generateBatchPresignedUrls(files);

// 2. Upload directly to S3
await axios.put(signedUrl, fileBlob, {
  headers: { "x-amz-acl": "public-read" },
  onUploadProgress: (e) => updateProgress(e.loaded / e.total)
});

// 3. Store blob in IndexedDB for offline
await filesDb.create({ fileId, blob: fileBlob, status: 'completed' });
```

**Attachment Schema**: `attachmentUrls: [string, string | "not-available"][]` - [original, thumbnail]

## Forms (React Hook Form)

```typescript
import { useRhfForm } from '@connected-repo/ui-mui/rhf-form/useRhfForm';
import { RhfTextField } from '@connected-repo/ui-mui/rhf-form/RhfTextField';

const { formMethods, RhfFormProvider } = useRhfForm({
  onSubmit: async (data) => { /* submit */ },
  formConfig: { resolver: zodResolver(schema) }
});

return (
  <RhfFormProvider>
    <RhfTextField name="email" label="Email" />
    <RhfSubmitButton />
  </RhfFormProvider>
);
```

## PWA

**Service Worker** (`sw/sw.ts`): Handles SSE sync, offline detection  
**Components**: `PwaInstallPrompt`, `PwaUpdatePrompt`, `OfflineBlocker`

## Offline Constraints (CRITICAL)

**Prohibited Offline**:
- Editing/deleting synced entries (`journalEntries` table)
- Must use server mutations to ensure consistency

**Allowed Offline**:
- Creating new entries (goes to `pendingSyncJournalEntries`)
- Deleting pending entries (local queue cleanup)

## oRPC Client

**Two Clients**:
```typescript
// React components (TanStack Query)
import { orpc } from '@/utils/orpc.tanstack.client';
const { data } = orpc.moduleName.getAll.useQuery();

// Workers (raw fetch, no React deps)
import { orpcFetch } from '@/utils/orpc.client';
const result = await orpcFetch.moduleName.endpoint({ ... });
```

## Design Principles

**Beautiful, Smooth, Delightful**:
- Tasteful colors, generous spacing, clear typography
- Smooth transitions (200-300ms)
- Immediate feedback on actions

**Color**:
```tsx
<Box sx={{ bgcolor: 'background.paper', color: 'text.primary' }} />
```

**Spacing** (theme.spacing = 8px):
```tsx
sx={{ p: 2, mb: 3, gap: 1.5 }}  // 16px, 24px, 12px
```

## Responsive (CRITICAL)

**Mobile-First**:
```tsx
<Box sx={{
  p: 2,              // Mobile
  md: { p: 3 },      // Desktop
  fontSize: { xs: '1rem', md: '0.875rem' }
}} />
```

**Touch Targets**: Min 44x44px

## E2E Testing (Playwright)

```bash
yarn test:e2e          # Run tests
yarn test:e2e:ui       # UI mode
```

Tests share browser state - use conditional logic before actions

## Best Practices
1. React 19: use(), useTransition, Suspense - minimize useEffect
2. NO `any` or `as unknown`
3. Modular: Keep modules independent
4. Lazy load pages
5. UI: Use `@connected-repo/ui-mui`
6. Direct imports only
7. Design: Tasteful, smooth, responsive
8. Offline: Check constraints before mutations
9. State: Server (oRPC), Global (Zustand), Forms (RHF)
10. Workers: DataWorker for DB, MediaWorker for processing
