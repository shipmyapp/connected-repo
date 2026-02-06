# Expowiz - Development Plan

**Trade Fair Lead Capture & Team Collaboration Platform**
*Complete Build Specification - Aligned with Repository Architecture*
*Version 3.0 - February 2026*

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Architecture Overview](#2-architecture-overview)
3. [Code Conventions](#3-code-conventions)
4. [Base Application Features](#4-base-application-features)
5. [Offline-First Data Architecture](#5-offline-first-data-architecture)
6. [Teams Feature](#6-teams-feature)
7. [Database Schema](#7-database-schema)
8. [API Specifications](#8-api-specifications)
9. [Implementation Phases](#9-implementation-phases)
10. [Edge Cases & Error Handling](#10-edge-cases--error-handling)

---

## 1. Introduction

### 1.1 What is Expowiz?

Expowiz is a mobile-first, offline-capable web application for trade fair exhibitors to capture, organize, and manage business leads. Built with an offline-first architecture, it enables booth staff to digitize visiting cards, record voice notes, add tags, and attach files - all stored locally first and synced to the cloud when connectivity returns.

### 1.2 Key Features

**Core Lead Capture:**
- Scan front and back of visiting cards using device camera
- Record voice notes about conversations
- Add custom tags for categorization
- Attach additional files and documents
- Quick note-taking with rich text

**Offline-First Design:**
- Full functionality without internet connection
- Local storage via TinyBase in Web Worker
- Automatic background sync via Data Worker
- Optimistic UI with conflict resolution
- Real-time updates via Server-Sent Events (SSE)

**Team Collaboration:**
- Create teams for booth staff
- Share leads across team members
- Role-based access (Owner, Admin, User)
- Centralized subscription management with per-member pricing

### 1.3 Target Users

- **Individual Exhibitors**: Single users capturing leads at trade fairs
- **Team Booth Staff**: Multiple staff sharing lead capture duties
- **Sales Teams**: Organizations managing leads across multiple events

### 1.4 Application Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        MAIN THREAD (React)                          │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  Components use: useWorkerQuery, useWorkerMutation          │   │
│  │  Zustand stores for global UI state                         │   │
│  │  MUI v7 for UI components                                   │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
└───────────────────────────────┼─────────────────────────────────────┘
                                │ PostMessage
┌───────────────────────────────▼─────────────────────────────────────┐
│                      DATA WORKER (Web Worker)                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  DataService: TinyBase store with IndexedDB persistence     │   │
│  │  SyncManager: Drains pending_entries queue                  │   │
│  │  ConnectivityService: Online/offline detection              │   │
│  │  StorageEngine: Manages local data storage                  │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
└───────────────────────────────┼─────────────────────────────────────┘
                                │ HTTP/SSE
┌───────────────────────────────▼─────────────────────────────────────┐
│                      BACKEND (Node.js + oRPC)                       │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  oRPC Router: Type-safe API endpoints                       │   │
│  │  Orchid ORM: PostgreSQL database access                    │   │
│  │  pg-tbus: Event-driven background tasks                   │   │
│  │  Better Auth: Authentication with Google OAuth            │   │
│  │  SSE Endpoint: Real-time sync push                        │   │
│  └───────────────────────────┬─────────────────────────────────┘   │
└───────────────────────────────┼─────────────────────────────────────┘
                                │
┌───────────────────────────────▼─────────────────────────────────────┐
│                         POSTGRESQL                                  │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  leads, tags, attachments, teams, subscriptions            │   │
│  │  pending_entries, sync_status, users                      │   │
│  │  pg_tbus_task_log for audit                              │   │
│  └─────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. Architecture Overview

### 2.1 Technology Stack

**Monorepo:**
- **Tool**: Turborepo 2.x with Yarn 1.22 workspaces
- **Structure**: `apps/*`, `packages/*`
- **Build Orchestration**: Parallel builds with dependency graph

**Frontend (apps/frontend):**
- **Framework**: React 19 + TypeScript 5.9
- **Build**: Vite 7 + SWC
- **Router**: React Router 7
- **UI**: Material-UI (MUI) v7 + @emotion
- **Forms**: React Hook Form + Zod resolvers
- **State**: 
  - Server: TanStack Query + oRPC client
  - Global: Zustand 5
  - Local: TinyBase 5.4 (in Web Worker)
- **Auth**: Better Auth (Google OAuth)
- **Offline**: Custom Data Worker (Web Worker)
- **PWA**: Vite PWA plugin + custom service worker
- **Testing**: Playwright (E2E)

**Backend (apps/backend):**
- **Runtime**: Node.js 22+
- **Framework**: oRPC (type-safe RPC) with OpenAPI
- **Database**: PostgreSQL 15+ with Orchid ORM 1.57
- **Task Queue**: pg-tbus (PostgreSQL-based event bus)
- **Auth**: Better Auth with custom Orchid adapter
- **Cron**: node-cron with mutex pattern
- **Observability**: OpenTelemetry + Sentry + Pino
- **Testing**: Vitest

**Shared Packages:**
- `@connected-repo/zod-schemas`: Validation schemas
- `@connected-repo/ui-mui`: MUI components + form wrappers
- `@connected-repo/typescript-config`: Shared TS configs

### 2.2 Key Architectural Patterns

**Offline-First Data Flow:**
1. UI calls `useWorkerMutation()` hook
2. Worker creates `pending_entry` in TinyBase queue
3. Optimistically updates local data table
4. Worker broadcasts `table-changed` event
5. `SyncManager` drains queue in background
6. Server processes changes and pushes via SSE
7. Local store updated with confirmed data

**Event-Driven Backend:**
- Events defined in `events/events.schema.ts`
- Handlers in `events/events.queries.ts`
- Tasks have retry limits, exponential backoff
- All execution logged to `pg_tbus_task_log`

**Type Safety:**
- oRPC provides end-to-end type safety
- Zod schemas shared between frontend/backend
- Orchid ORM generates TypeScript types from DB

**Module Isolation:**
- No cross-module imports
- Each feature is self-contained
- Clear separation between modules

---

## 3. Code Conventions

### 3.1 Formatting & Style

**Enforced by Biome:**
- **Indentation**: Tabs (NOT spaces)
- **Line Width**: 100 characters
- **Quotes**: Double quotes
- **Semicolons**: Always
- **Trailing commas**: ES5 style

**TypeScript:**
- **NO `any` or `as unknown`**: Strict TypeScript enforced
- **Descriptive IDs**: `userId`, `leadId` (NOT `id`)
- **Foreign Keys**: Descriptive (`capturedByUserId`, not `capturedById`)
- **Naming**: camelCase (code), snake_case (DB), PascalCase (classes)

**Imports:**
- **NO barrel exports**: Direct imports only
```typescript
// CORRECT
import { Button } from '@connected-repo/ui-mui/form/Button'
import { leadCreateZod } from '@connected-repo/zod-schemas/lead.zod'

// WRONG
import { Button } from '@connected-repo/ui-mui'
```

### 3.2 Database Conventions

**Naming:**
- Tables: snake_case (`team_members`, `pending_leads`)
- Columns: snake_case (`created_at`, `captured_by_user_id`)
- Classes: PascalCase (`LeadTable`, `TeamMemberTable`)

**Migrations:**
- **ALWAYS auto-generate**: `yarn db g <name>`
- **Backward-compatible only**: Start-first deployment
- **Never manual**: Only if auto-generator fails
- **Test before deploy**: On production-like data

**Patterns:**
- **Soft deletes**: Use `deletedAt` column (NOT `deleted_at` in Orchid)
- **Timestamps**: Use `timestampNumber` (epoch ms) or `timestamps()` helper
- **Primary Keys**: ULID (NOT UUID) for sortability
- **Foreign Keys**: Always descriptive

### 3.3 File Organization

**Frontend Module Structure:**
```
modules/
├── leads/
│   ├── pages/
│   │   ├── LeadsList.page.tsx
│   │   └── LeadDetail.page.tsx
│   ├── leads.router.tsx
│   └── leads.spec.ts
```

**Backend Module Structure:**
```
modules/
├── leads/
│   ├── leads.table.ts
│   ├── leads.router.ts
│   ├── leads.zod.ts
│   └── leads.service.ts
```

---

## 4. Base Application Features

### 4.1 User Authentication

**Sign Up / Login:**
- Google OAuth via Better Auth
- Session management with refresh tokens
- Profile management (name, avatar, company)

**Auto-Join Teams:**
- If email pre-added to team roster, auto-join on first login
- No invitation acceptance required

### 4.2 Lead Capture

#### Visiting Card Scanning

**Flow:**
1. User taps "Capture Lead" button
2. Camera interface opens (device camera API)
3. Take photo of card front
4. Optional: Take photo of card back
5. Images compressed to WebP (max 1200px)
6. Manual entry/edit of contact details
7. Save to local TinyBase store (immediate)
8. Create pending_entry for sync

**Image Handling:**
- Capture: Device camera (front/back)
- Compression: Client-side WebP conversion
- Local: Base64 in TinyBase (temporarily)
- Remote: Upload to storage bucket (post-sync)
- Format: WebP for efficiency

**Contact Fields:**
- contactName (required)
- companyName
- jobTitle
- email
- phone
- website
- address

#### Voice Notes

**Recording:**
- Hold-to-record button
- Maximum 5 minutes per note
- Visual waveform during recording
- Pause/resume functionality

**Storage:**
- Local: Base64 encoded audio (temporary)
- Remote: MP3 format, storage bucket
- Compression: 64kbps for efficiency

#### Tags System

**Creating Tags:**
- Type and create on-the-fly
- Color-coded categories (predefined palette)
- Auto-suggest existing tags

**Tag Management:**
- Predefined sets (Hot Lead, Follow-up, Qualified, etc.)
- Workspace-scoped (personal vs team)
- Bulk tag operations

**Zod Schema:**
```typescript
export const tagZod = z.object({
  tagId: z.string().ulid(),
  workspaceType: z.enum(['personal', 'team']),
  teamId: z.string().ulid().optional(),
  name: z.string().min(1).max(100),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  createdByUserId: z.string().ulid(),
  createdAt: z.number(),
})
```

#### Additional Notes

**Rich Text Notes:**
- Plain text with markdown support
- Auto-save while typing (debounced)
- Maximum 5000 characters

### 4.3 Lead Management

#### Lead List View

**Features:**
- Grid/list toggle
- Sort by: Date, Name, Company, Rating
- Filter by: Tags, Date range, Sync status
- Search: Full-text across contact fields
- Virtual scrolling for performance

**Lead Card Display:**
- Thumbnail of card front
- Contact name & company
- Tags (up to 3 visible)
- Capture date
- Sync status indicator (synced/pending/offline)

#### Lead Detail View

**Sections:**
1. **Card Images**: Gallery with zoom
2. **Contact Info**: Editable fields
3. **Voice Notes**: Audio player
4. **Tags**: Add/remove interface
5. **Notes**: Markdown editor
6. **Activity Log**: Capture history, edits, syncs

#### Lead Editing

**Capabilities:**
- Edit all contact fields
- Re-record voice notes
- Add/remove card images
- Modify tags
- Update notes

**Audit Trail:**
- Track changes via TinyBase history
- Show last modified timestamp
- Soft delete with recovery option

### 4.4 Export & Import

#### Export Leads

**Formats:**
- **Excel**: .xlsx with images as links
- **CSV**: Standard format
- **vCard**: Individual contact export

**Filters:**
- Date range
- Tags
- Sync status
- Workspace scope

---

## 5. Offline-First Data Architecture

### 5.1 Data Worker Architecture

The Data Worker runs in a separate thread and manages all data operations:

```
┌─────────────────────────────────────────────────────────────┐
│                      DATA WORKER                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌───────────────────────────────────────────────────────┐ │
│  │  TinyBase Store                                       │ │
│  │  ├─ leads table                                       │ │
│  │  ├─ tags table                                        │ │
│  │  ├─ attachments table                                 │ │
│  │  ├─ pending_entries queue                             │ │
│  │  └─ sync_status table                                 │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐ │
│  │  Storage Engine (IndexedDB)                          │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐ │
│  │  SyncManager                                          │ │
│  │  ├─ drainPendingEntries()                            │ │
│  │  ├─ exponential backoff retry                        │ │
│  │  ├─ conflict resolution                              │ │
│  │  └─ sync status tracking                             │ │
│  └───────────────────────────────────────────────────────┘ │
│                            │                                │
│  ┌─────────────────────────▼─────────────────────────────┐ │
│  │  ConnectivityService                                  │ │
│  │  ├─ Online/offline detection                         │ │
│  │  ├─ Network change events                            │ │
│  │  └─ Auto-sync on reconnect                           │ │
│  └───────────────────────────────────────────────────────┘ │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### 5.2 TinyBase Schema

```typescript
// TinyBase schema for local data management
export const localSchema = {
  // Leads table - primary data
  leads: {
    leadId: { type: 'string' },
    workspaceType: { type: 'string' }, // 'personal', 'team'
    teamId: { type: 'string', nullable: true },
    
    // Contact info
    contactName: { type: 'string' },
    companyName: { type: 'string', nullable: true },
    jobTitle: { type: 'string', nullable: true },
    email: { type: 'string', nullable: true },
    phone: { type: 'string', nullable: true },
    website: { type: 'string', nullable: true },
    address: { type: 'string', nullable: true },
    
    // Content
    notes: { type: 'string', nullable: true },
    voiceNoteUrl: { type: 'string', nullable: true },
    voiceNoteTranscript: { type: 'string', nullable: true },
    cardImages: { type: 'string' }, // JSON array
    
    // Tags (simplified many-to-many)
    tagIds: { type: 'string' }, // JSON array
    
    // Status
    status: { type: 'string' }, // 'active', 'archived', 'deleted'
    syncStatus: { type: 'string' }, // 'synced', 'pending', 'error'
    
    // Timestamps (epoch ms)
    createdAt: { type: 'number' },
    updatedAt: { type: 'number' },
    capturedByUserId: { type: 'string' },
    
    // Remote IDs
    remoteLeadId: { type: 'string', nullable: true },
  },

  // Tags table
  tags: {
    tagId: { type: 'string' },
    workspaceType: { type: 'string' },
    teamId: { type: 'string', nullable: true },
    name: { type: 'string' },
    color: { type: 'string' },
    createdByUserId: { type: 'string' },
    createdAt: { type: 'number' },
    remoteTagId: { type: 'string', nullable: true },
  },

  // Attachments
  attachments: {
    attachmentId: { type: 'string' },
    leadId: { type: 'string' },
    filename: { type: 'string' },
    fileType: { type: 'string' },
    sizeBytes: { type: 'number' },
    localData: { type: 'string', nullable: true }, // base64
    remoteUrl: { type: 'string', nullable: true },
    syncStatus: { type: 'string' },
    createdAt: { type: 'number' },
  },

  // Pending entries queue (for sync)
  pending_entries: {
    pendingEntryId: { type: 'string' },
    workspaceId: { type: 'string' },
    entityType: { type: 'string' }, // 'lead', 'tag', 'attachment'
    entityId: { type: 'string' },
    operation: { type: 'string' }, // 'create', 'update', 'delete'
    data: { type: 'string' }, // JSON
    status: { type: 'string' }, // 'pending', 'in_progress', 'completed', 'failed'
    retryCount: { type: 'number' },
    errorMessage: { type: 'string', nullable: true },
    createdAt: { type: 'number' },
  },

  // Sync status tracking
  sync_status: {
    workspaceId: { type: 'string' },
    lastSyncAt: { type: 'number', nullable: true },
    isSyncing: { type: 'boolean' },
    pendingCount: { type: 'number' },
    errorCount: { type: 'number' },
  },
};
```

### 5.3 Sync Flow

**Creating a Lead (Optimistic):**
```typescript
// 1. UI calls mutation hook
const { mutate } = useWorkerMutation({
  mutationFn: async (leadData) => {
    // 2. Worker creates pending entry
    const pendingEntry = {
      pendingEntryId: ulid(),
      workspaceId: getCurrentWorkspaceId(),
      entityType: 'lead',
      entityId: localLeadId,
      operation: 'create',
      data: JSON.stringify(leadData),
      status: 'pending',
      retryCount: 0,
      createdAt: Date.now(),
    }
    
    // 3. Add to pending_entries queue
    await addPendingEntry(pendingEntry)
    
    // 4. Optimistically update leads table
    await createLeadLocally({ ...leadData, syncStatus: 'pending' })
    
    // 5. Broadcast change to UI
    broadcastTableChange('leads', 'create', localLeadId)
    
    return { localLeadId }
  }
})
```

**Background Sync Process:**
```typescript
// SyncManager drains queue
async function drainPendingEntries() {
  const pending = await getPendingEntries('pending')
  
  for (const entry of pending) {
    try {
      // Mark as in_progress
      await updatePendingEntry(entry.pendingEntryId, { status: 'in_progress' })
      
      // Send to server via oRPC
      const result = await orpcClient.leads.create(entry.data)
      
      // Update local record with remote ID
      await updateLead(entry.entityId, {
        remoteLeadId: result.leadId,
        syncStatus: 'synced',
      })
      
      // Mark as completed
      await updatePendingEntry(entry.pendingEntryId, { status: 'completed' })
    } catch (error) {
      // Increment retry count
      const retryCount = entry.retryCount + 1
      
      if (retryCount >= 5) {
        // Mark as failed after max retries
        await updatePendingEntry(entry.pendingEntryId, {
          status: 'failed',
          errorMessage: error.message,
          retryCount,
        })
      } else {
        // Exponential backoff: retry after 2^retryCount seconds
        await updatePendingEntry(entry.pendingEntryId, {
          status: 'pending',
          retryCount,
          retryAfter: Date.now() + Math.pow(2, retryCount) * 1000,
        })
      }
    }
  }
}
```

### 5.4 Real-Time Sync (SSE)

Server pushes changes to clients via Server-Sent Events:

```typescript
// Backend: SSE endpoint
export const syncRouter = {
  subscribe: rpcProtectedProcedure
    .input(z.object({ lastSyncAt: z.number() }))
    .subscription(async function*({ input, ctx }) {
      const userId = ctx.user.userId
      
      // Yield initial data
      yield await getChangesSince(userId, input.lastSyncAt)
      
      // Subscribe to changes
      for await (const change of syncService.subscribe(userId)) {
        yield change
      }
    }),
}

// Frontend: Subscribe to changes
useEffect(() => {
  const eventSource = new EventSource(
    `${API_URL}/sync?token=${accessToken}`
  )
  
  eventSource.onmessage = (event) => {
    const change = JSON.parse(event.data)
    // Apply change to local store
    worker.applyRemoteChange(change)
  }
  
  return () => eventSource.close()
}, [])
```

### 5.5 Conflict Resolution

**Strategy: Last Write Wins with Conflict Detection**

```typescript
async function applyRemoteChange(change) {
  const localRecord = await getLocalRecord(change.entityId)
  
  if (!localRecord) {
    // No local record, just apply
    await createLocalRecord(change.data)
    return
  }
  
  if (localRecord.updatedAt > change.data.updatedAt) {
    // Local is newer - keep local, but mark conflict
    await markConflict(change.entityId, 'local_newer')
    return
  }
  
  if (localRecord.pendingEntryId) {
    // Has pending local changes - complex conflict
    await markConflict(change.entityId, 'both_modified')
    return
  }
  
  // Apply remote change
  await updateLocalRecord(change.entityId, change.data)
}
```

---

## 6. Teams Feature

> **Note:** Teams is an incremental addition to the base application. It extends the lead capture functionality to support multi-user collaboration.

### 6.1 Feature Overview

Teams enables exhibitors to collaborate on lead capture. Multiple booth staff can capture leads under a shared team account with:
- Centralized billing (per-member pricing)
- Role-based access control
- Shared lead visibility
- Subscription management

### 6.2 User Roles & Permissions

| Action | Owner | Admin | User |
|--------|-------|-------|------|
| **Team Management** ||||
| Create team | ✓ | ✗ | ✗ |
| Add members | ✓ | ✓ | ✗ |
| Leave team | ✗ | ✓ | ✓ |
| Remove members | ✓ | ✓ (except Owner) | ✗ |
| Change member roles | ✓ | ✓ (promote to Admin only) | ✗ |
| Transfer ownership | ✓ | ✗ | ✗ |
| Delete team | ✓ | ✗ | ✗ |
| **Workspace** ||||
| Switch between teams | ✓ | ✓ | ✓ |
| **Subscriptions** ||||
| Purchase subscription | ✓ | ✗ | ✗ |
| View subscription status | ✓ | ✓ | ✓ |
| Select members for plan | ✓ | ✗ | ✗ |
| **Lead Capture** ||||
| Capture leads (with subscription) | ✓ | ✓ | ✓ |
| Capture leads (no subscription) | ✓ | ✓ | ✓ (local only) |
| View personal leads | ✓ | ✓ | ✓ |
| View all team leads | ✓ | ✓ | ✗ |
| Edit any team lead | ✓ | ✓ | ✗ |
| Delete leads | ✓ | ✓ | Own leads only |
| Export leads | ✓ | ✓ | ✗ |

### 6.3 Core Team Features

#### Team Management

**Create Team:**
1. User clicks "Create Team" in workspace switcher
2. Enter team name (3-50 chars, unique per owner)
3. Optional: Upload team logo
4. System creates team with user as Owner
5. Auto-switch to team workspace

**Add Team Member:**
1. Owner/Admin goes to Team Settings → Members
2. Click "Add Member"
3. Enter email address
4. Select role (Admin or User)
5. Member immediately added to roster

**Auto-join Logic:**
- Existing user: Team appears in workspace switcher immediately
- New user: Team appears upon signup with that email
- No invitation acceptance required

#### Workspace Switching

```
┌─────────────────────────────┐
│  🏢 [Active Workspace] ▼   │
├─────────────────────────────┤
│  📋 Personal                │
│  ─────────────────────      │
│  🏢 Acme Corp              │  ← Current
│     Owner · Active         │
│  🏢 TechStart Inc          │
│     Admin · Expires in 5d  │
│  ─────────────────────      │
│  ➕ Create New Team         │
└─────────────────────────────┘
```

**Behavior:**
- Click to switch workspaces
- Role shown inline
- Expiration warnings for subscriptions
- Badge for pending items

#### Team Subscriptions

**Plans:**

| Plan | Duration | Price | Best For |
|------|----------|-------|----------|
| Trade Fair | 5 days | ₹1,000/member | Single event |
| Monthly | 30 days | ₹2,000/member | Multiple events |
| Yearly | 365 days | ₹10,000/member | Regular exhibitors |

**Member Selection:**
- Owner selects members at purchase time
- Checkboxes next to each member
- Per-member pricing (e.g., 3 members × ₹1,000 = ₹3,000)
- Only selected members can sync to cloud

**Multiple Subscriptions:**
- Teams can have overlapping subscriptions
- Longest active subscription determines expiration
- All subscriptions tracked separately

#### Lead Capture in Teams

**Capture Flow:**
1. User initiates lead capture (same as personal)
2. Lead ALWAYS saved locally first
3. Immediately visible in user's workspace
4. **Sync behavior:**
   - If active subscription AND user selected: Auto-sync to cloud
   - If no subscription OR user not selected: Local only
   - When subscription activates: Pending leads sync automatically

**Lead Visibility:**
- **Personal Workspace**: Own leads only
- **Team Workspace (User)**: Own leads + all team leads (view-only)
- **Team Workspace (Admin/Owner)**: All team leads (full edit)

**Team Leads Page (Admin/Owner):**
- Grid/list view of all leads
- Filters: Captured by, Date range, Tags
- Bulk export
- Statistics: Total leads, by member

### 6.4 Pending Leads

When users capture leads without active subscription:

**Storage:**
- Local TinyBase only (never synced)
- Same schema as regular leads
- Photos as base64
- Unlimited storage

**Sync on Activation:**
1. Subscription becomes active
2. System detects pending leads
3. Shows: "You have 5 pending leads to sync"
4. User clicks "Sync Now"
5. Batch upload to server
6. Clear from pending queue

**Offline Capture:**
- Same as pending lead flow
- Marked with `isOffline: true`
- Auto-syncs when online + subscription active

---

## 7. Database Schema

### 7.1 Base Tables (Orchid ORM)

#### Users Table

```typescript
// modules/users/users.table.ts
import { BaseTable } from '../../db/base_table'

export class UserTable extends BaseTable {
  readonly table = 'users'
  
  columns = this.setColumns((t) => ({
    userId: t.name('user_id').ulid().primaryKey(),
    email: t.string().unique(),
    fullName: t.name('full_name').string().nullable(),
    avatarUrl: t.name('avatar_url').string().nullable(),
    phone: t.string().nullable(),
    company: t.string().nullable(),
    jobTitle: t.name('job_title').string().nullable(),
    timezone: t.string().default('Asia/Kolkata'),
    ...t.timestamps(),
  }))
}
```

#### Leads Table

```typescript
// modules/leads/leads.table.ts
export class LeadTable extends BaseTable {
  readonly table = 'leads'
  
  columns = this.setColumns((t) => ({
    leadId: t.name('lead_id').ulid().primaryKey(),
    
    // Workspace context
    workspaceType: t.name('workspace_type').enum('personal', 'team').default('personal'),
    teamId: t.name('team_id').ulid().nullable().foreignKey('teams', 'team_id'),
    
    // Contact info
    contactName: t.name('contact_name').string(),
    companyName: t.name('company_name').string().nullable(),
    jobTitle: t.name('job_title').string().nullable(),
    email: t.string().nullable(),
    phone: t.string().nullable(),
    website: t.string().nullable(),
    address: t.text().nullable(),
    
    // Content
    notes: t.text().nullable(),
    voiceNoteUrl: t.name('voice_note_url').string().nullable(),
    voiceNoteTranscript: t.name('voice_note_transcript').text().nullable(),
    cardImages: t.name('card_images').array(t.string()).default([]),
    
    // Metadata
    capturedByUserId: t.name('captured_by_user_id').ulid().foreignKey('users', 'user_id'),
    isTeamLead: t.name('is_team_lead').boolean().default(false),
    
    // Soft delete (for sync compatibility)
    deletedAt: t.name('deleted_at').timestampNumber().nullable(),
    deletedBy: t.name('deleted_by').ulid().nullable().foreignKey('users', 'user_id'),
    
    ...t.timestamps(),
  }))
  
  relations = {
    capturedBy: this.belongsTo(() => UserTable, {
      columns: ['capturedByUserId'],
      references: ['userId'],
    }),
    team: this.belongsTo(() => TeamTable, {
      columns: ['teamId'],
      references: ['teamId'],
    }),
    tags: this.hasAndBelongsToMany(() => TagTable, {
      columns: ['leadId'],
      references: ['tagId'],
    }),
  }
}
```

#### Tags Table

```typescript
// modules/tags/tags.table.ts
export class TagTable extends BaseTable {
  readonly table = 'tags'
  
  columns = this.setColumns((t) => ({
    tagId: t.name('tag_id').ulid().primaryKey(),
    workspaceType: t.name('workspace_type').enum('personal', 'team').default('personal'),
    teamId: t.name('team_id').ulid().nullable().foreignKey('teams', 'team_id'),
    name: t.string(),
    color: t.string().default('#3B82F6'),
    createdByUserId: t.name('created_by_user_id').ulid().foreignKey('users', 'user_id'),
    ...t.timestamps(),
  }))
  
  relations = {
    createdBy: this.belongsTo(() => UserTable, {
      columns: ['createdByUserId'],
      references: ['userId'],
    }),
  }
}

// Junction table for lead-tags
export class LeadTagTable extends BaseTable {
  readonly table = 'lead_tags'
  
  columns = this.setColumns((t) => ({
    leadTagId: t.name('lead_tag_id').ulid().primaryKey(),
    leadId: t.name('lead_id').ulid().foreignKey('leads', 'lead_id'),
    tagId: t.name('tag_id').ulid().foreignKey('tags', 'tag_id'),
    ...t.timestamps(),
  }))
}
```

#### Attachments Table

```typescript
// modules/attachments/attachments.table.ts
export class AttachmentTable extends BaseTable {
  readonly table = 'attachments'
  
  columns = this.setColumns((t) => ({
    attachmentId: t.name('attachment_id').ulid().primaryKey(),
    leadId: t.name('lead_id').ulid().foreignKey('leads', 'lead_id'),
    filename: t.string(),
    fileType: t.name('file_type').string(),
    fileSize: t.name('file_size').integer(), // bytes
    storagePath: t.name('storage_path').string(),
    createdByUserId: t.name('created_by_user_id').ulid().foreignKey('users', 'user_id'),
    ...t.timestamps(),
  }))
  
  relations = {
    lead: this.belongsTo(() => LeadTable, {
      columns: ['leadId'],
      references: ['leadId'],
    }),
  }
}
```

### 7.2 Teams Tables

#### Teams Table

```typescript
// modules/teams/teams.table.ts
export class TeamTable extends BaseTable {
  readonly table = 'teams'
  
  columns = this.setColumns((t) => ({
    teamId: t.name('team_id').ulid().primaryKey(),
    name: t.string().check(t.sql`char_length(name) >= 3 AND char_length(name) <= 50`),
    slug: t.string().unique(),
    logoUrl: t.name('logo_url').string().nullable(),
    createdByUserId: t.name('created_by_user_id').ulid().foreignKey('users', 'user_id'),
    isActive: t.name('is_active').boolean().default(true),
    metadata: t.json().default({}),
    ...t.timestamps(),
  }))
  
  relations = {
    createdBy: this.belongsTo(() => UserTable, {
      columns: ['createdByUserId'],
      references: ['userId'],
    }),
    members: this.hasMany(() => TeamMemberTable, {
      columns: ['teamId'],
      references: ['teamId'],
    }),
    subscriptions: this.hasMany(() => SubscriptionTable, {
      columns: ['teamId'],
      references: ['teamId'],
    }),
  }
}
```

#### Team Members Table

```typescript
// modules/teams/team_members.table.ts
export class TeamMemberTable extends BaseTable {
  readonly table = 'team_members'
  
  columns = this.setColumns((t) => ({
    teamMemberId: t.name('team_member_id').ulid().primaryKey(),
    teamId: t.name('team_id').ulid().foreignKey('teams', 'team_id'),
    userId: t.name('user_id').ulid().nullable().foreignKey('users', 'user_id'),
    email: t.string(), // For auto-join before user exists
    role: t.enum('owner', 'admin', 'user').default('user'),
    addedByUserId: t.name('added_by_user_id').ulid().foreignKey('users', 'user_id'),
    removedAt: t.name('removed_at').timestampNumber().nullable(),
    removedByUserId: t.name('removed_by_user_id').ulid().nullable().foreignKey('users', 'user_id'),
    ...t.timestamps(),
  }))
  
  relations = {
    team: this.belongsTo(() => TeamTable, {
      columns: ['teamId'],
      references: ['teamId'],
    }),
    user: this.belongsTo(() => UserTable, {
      columns: ['userId'],
      references: ['userId'],
    }),
  }
}
```

#### Subscriptions Table

```typescript
// modules/subscriptions/subscriptions.table.ts
export class SubscriptionTable extends BaseTable {
  readonly table = 'subscriptions'
  
  columns = this.setColumns((t) => ({
    subscriptionId: t.name('subscription_id').ulid().primaryKey(),
    teamId: t.name('team_id').ulid().foreignKey('teams', 'team_id'),
    plan: t.enum('trade_fair', 'monthly', 'yearly'),
    pricePerMember: t.name('price_per_member').integer(), // in paise
    selectedMemberIds: t.name('selected_member_ids').array(t.ulid()),
    startDate: t.name('start_date').timestampNumber(),
    endDate: t.name('end_date').timestampNumber(),
    isActive: t.name('is_active').boolean().default(true),
    paymentId: t.name('payment_id').string().nullable(),
    paymentStatus: t.name('payment_status').enum('pending', 'completed', 'failed', 'refunded').default('completed'),
    createdByUserId: t.name('created_by_user_id').ulid().foreignKey('users', 'user_id'),
    ...t.timestamps(),
  }))
  
  relations = {
    team: this.belongsTo(() => TeamTable, {
      columns: ['teamId'],
      references: ['teamId'],
    }),
  }
}
```

### 7.3 Database Indexes

```typescript
// Add to respective table files or migration

// Leads indexes
CREATE INDEX idx_leads_workspace ON leads(workspace_type, team_id);
CREATE INDEX idx_leads_captured_by ON leads(captured_by_user_id);
CREATE INDEX idx_leads_team_created ON leads(team_id, created_at DESC);
CREATE INDEX idx_leads_active ON leads(deleted_at) WHERE deleted_at IS NULL;

// Team members indexes
CREATE INDEX idx_team_members_team ON team_members(team_id, removed_at) WHERE removed_at IS NULL;
CREATE INDEX idx_team_members_user ON team_members(user_id, removed_at) WHERE removed_at IS NULL;

// Subscriptions indexes
CREATE INDEX idx_subscriptions_team_active ON subscriptions(team_id, is_active, end_date);
```

### 7.4 Sync Hooks

Database hooks to push changes to sync service:

```typescript
// modules/leads/leads.table.ts
export class LeadTable extends BaseTable {
  // ... columns definition ...
  
  afterCreate = [
    async (data, q) => {
      await syncService.broadcastChange({
        entityType: 'lead',
        operation: 'create',
        data,
      })
    }
  ]
  
  afterUpdate = [
    async (data, q) => {
      await syncService.broadcastChange({
        entityType: 'lead',
        operation: 'update',
        data,
      })
    }
  ]
}
```

---

## 8. API Specifications

### 8.1 oRPC Router Structure

```typescript
// routers/user_app.router.ts
export const userAppRouter = {
  // Auth
  auth: authRouter,
  
  // Leads
  leads: leadsRouter,
  
  // Tags
  tags: tagsRouter,
  
  // Teams
  teams: teamsRouter,
  teamMembers: teamMembersRouter,
  
  // Subscriptions
  subscriptions: subscriptionsRouter,
  
  // Sync
  sync: syncRouter,
}
```

### 8.2 Lead Endpoints

#### Create Lead

```typescript
// modules/leads/leads.router.ts
export const leadsRouter = {
  create: rpcProtectedProcedure
    .input(leadCreateZod)
    .output(z.object({ leadId: z.string().ulid() }))
    .mutation(async ({ input, ctx }) => {
      const leadId = ulid()
      
      await db.leads.create({
        leadId,
        capturedByUserId: ctx.user.userId,
        ...input,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      
      return { leadId }
    }),
  
  list: rpcProtectedProcedure
    .input(z.object({
      workspaceType: z.enum(['personal', 'team']),
      teamId: z.string().ulid().optional(),
      cursor: z.string().ulid().optional(),
      limit: z.number().max(100).default(50),
    }))
    .output(z.object({
      leads: z.array(leadZod),
      nextCursor: z.string().ulid().optional(),
    }))
    .query(async ({ input, ctx }) => {
      // Check permissions for team workspace
      if (input.workspaceType === 'team' && input.teamId) {
        const membership = await db.teamMembers.findBy({
          teamId: input.teamId,
          userId: ctx.user.userId,
          removedAt: null,
        })
        
        if (!membership) {
          throw new Error('Not a team member')
        }
      }
      
      const leads = await db.leads
        .where({
          workspaceType: input.workspaceType,
          teamId: input.teamId || null,
          deletedAt: null,
        })
        .order({ createdAt: 'DESC' })
        .limit(input.limit)
        .cursor(input.cursor ? { leadId: input.cursor } : undefined)
      
      return {
        leads,
        nextCursor: leads.length === input.limit 
          ? leads[leads.length - 1].leadId 
          : undefined,
      }
    }),
  
  update: rpcProtectedProcedure
    .input(z.object({
      leadId: z.string().ulid(),
      data: leadUpdateZod,
    }))
    .mutation(async ({ input, ctx }) => {
      const lead = await db.leads.findBy({ leadId: input.leadId })
      
      if (!lead) throw new Error('Lead not found')
      
      // Check permissions
      if (lead.capturedByUserId !== ctx.user.userId) {
        // Must be team admin/owner
        const membership = await db.teamMembers.findBy({
          teamId: lead.teamId,
          userId: ctx.user.userId,
          role: ['owner', 'admin'],
          removedAt: null,
        })
        
        if (!membership) {
          throw new Error('Not authorized')
        }
      }
      
      await db.leads.findBy({ leadId: input.leadId }).update({
        ...input.data,
        updatedAt: Date.now(),
      })
      
      return { success: true }
    }),
  
  delete: rpcProtectedProcedure
    .input(z.object({ leadId: z.string().ulid() }))
    .mutation(async ({ input, ctx }) => {
      const lead = await db.leads.findBy({ leadId: input.leadId })
      
      if (!lead) throw new Error('Lead not found')
      
      // Soft delete
      await db.leads.findBy({ leadId: input.leadId }).update({
        deletedAt: Date.now(),
        deletedBy: ctx.user.userId,
      })
      
      return { success: true }
    }),
}
```

### 8.3 Team Endpoints

#### Create Team

```typescript
// modules/teams/teams.router.ts
export const teamsRouter = {
  create: rpcProtectedProcedure
    .input(z.object({
      name: z.string().min(3).max(50),
      logoUrl: z.string().url().optional(),
    }))
    .output(z.object({
      team: teamZod,
      membership: teamMemberZod,
    }))
    .mutation(async ({ input, ctx }) => {
      const teamId = ulid()
      const membershipId = ulid()
      
      // Generate slug
      const slug = `${slugify(input.name)}-${teamId.slice(-6)}`
      
      const team = await db.teams.create({
        teamId,
        name: input.name,
        slug,
        logoUrl: input.logoUrl,
        createdByUserId: ctx.user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      
      const membership = await db.teamMembers.create({
        teamMemberId: membershipId,
        teamId,
        userId: ctx.user.userId,
        email: ctx.user.email,
        role: 'owner',
        addedByUserId: ctx.user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      
      return { team, membership }
    }),
  
  get: rpcProtectedProcedure
    .input(z.object({ teamId: z.string().ulid() }))
    .output(z.object({
      team: teamZod,
      myRole: z.enum(['owner', 'admin', 'user']),
      members: z.array(teamMemberWithUserZod),
      subscription: subscriptionStatusZod.optional(),
      stats: z.object({
        totalLeads: z.number(),
        leadsThisMonth: z.number(),
        memberCount: z.number(),
      }),
    }))
    .query(async ({ input, ctx }) => {
      const membership = await db.teamMembers.findBy({
        teamId: input.teamId,
        userId: ctx.user.userId,
        removedAt: null,
      })
      
      if (!membership) throw new Error('Not a team member')
      
      const team = await db.teams.findBy({ teamId: input.teamId })
      const members = await db.teamMembers
        .where({ teamId: input.teamId, removedAt: null })
        .join('user')
      
      const subscription = await getActiveSubscription(input.teamId)
      
      return {
        team,
        myRole: membership.role,
        members,
        subscription,
        stats: await getTeamStats(input.teamId),
      }
    }),
}
```

#### Add Team Member

```typescript
// modules/teams/team_members.router.ts
export const teamMembersRouter = {
  add: rpcProtectedProcedure
    .input(z.object({
      teamId: z.string().ulid(),
      email: z.string().email(),
      role: z.enum(['admin', 'user']),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check if user is owner/admin
      const membership = await db.teamMembers.findBy({
        teamId: input.teamId,
        userId: ctx.user.userId,
        role: ['owner', 'admin'],
        removedAt: null,
      })
      
      if (!membership) throw new Error('Not authorized')
      
      // Check if email already in team
      const existing = await db.teamMembers.findBy({
        teamId: input.teamId,
        email: input.email,
        removedAt: null,
      })
      
      if (existing) throw new Error('Member already in team')
      
      // Find user by email (if exists)
      const user = await db.users.findBy({ email: input.email })
      
      await db.teamMembers.create({
        teamMemberId: ulid(),
        teamId: input.teamId,
        userId: user?.userId || null,
        email: input.email,
        role: input.role,
        addedByUserId: ctx.user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      
      return { success: true }
    }),
  
  remove: rpcProtectedProcedure
    .input(z.object({
      teamId: z.string().ulid(),
      teamMemberId: z.string().ulid(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check permissions
      const myMembership = await db.teamMembers.findBy({
        teamId: input.teamId,
        userId: ctx.user.userId,
        removedAt: null,
      })
      
      const targetMember = await db.teamMembers.findBy({
        teamMemberId: input.teamMemberId,
      })
      
      if (!targetMember) throw new Error('Member not found')
      
      // Owner can remove anyone except themselves
      if (myMembership.role === 'owner') {
        if (targetMember.userId === ctx.user.userId) {
          throw new Error('Owner cannot leave. Transfer ownership first.')
        }
      }
      // Admin can only remove users
      else if (myMembership.role === 'admin') {
        if (targetMember.role !== 'user') {
          throw new Error('Admins can only remove users')
        }
      }
      else {
        throw new Error('Not authorized')
      }
      
      // Soft delete
      await db.teamMembers.findBy({ teamMemberId: input.teamMemberId }).update({
        removedAt: Date.now(),
        removedByUserId: ctx.user.userId,
      })
      
      return { success: true }
    }),
}
```

### 8.4 Subscription Endpoints

#### Create Subscription

```typescript
// modules/subscriptions/subscriptions.router.ts
export const subscriptionsRouter = {
  create: rpcProtectedProcedure
    .input(z.object({
      teamId: z.string().ulid(),
      plan: z.enum(['trade_fair', 'monthly', 'yearly']),
      selectedMemberIds: z.array(z.string().ulid()),
      paymentId: z.string(),
      paymentSignature: z.string(),
    }))
    .output(z.object({
      subscription: subscriptionZod,
      syncedLeads: z.number(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Verify user is owner
      const membership = await db.teamMembers.findBy({
        teamId: input.teamId,
        userId: ctx.user.userId,
        role: 'owner',
        removedAt: null,
      })
      
      if (!membership) throw new Error('Only owner can purchase subscriptions')
      
      // Verify all selected members are active
      const activeMembers = await db.teamMembers
        .where({
          teamId: input.teamId,
          removedAt: null,
        })
        .pluck('userId')
      
      const invalidMembers = input.selectedMemberIds.filter(
        id => !activeMembers.includes(id)
      )
      
      if (invalidMembers.length > 0) {
        throw new Error('Some selected members are no longer in the team')
      }
      
      // Verify Razorpay payment
      const isValid = await verifyRazorpayPayment(
        input.paymentId,
        input.paymentSignature
      )
      
      if (!isValid) throw new Error('Invalid payment')
      
      // Calculate dates
      const startDate = Date.now()
      const endDate = calculateEndDate(startDate, input.plan)
      
      const subscription = await db.subscriptions.create({
        subscriptionId: ulid(),
        teamId: input.teamId,
        plan: input.plan,
        pricePerMember: getPlanPrice(input.plan),
        selectedMemberIds: input.selectedMemberIds,
        startDate,
        endDate,
        isActive: true,
        paymentId: input.paymentId,
        paymentStatus: 'completed',
        createdByUserId: ctx.user.userId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      })
      
      // Sync any pending leads
      const syncedLeads = await syncPendingLeads(input.teamId, ctx.user.userId)
      
      return { subscription, syncedLeads }
    }),
  
  getStatus: rpcProtectedProcedure
    .input(z.object({ teamId: z.string().ulid() }))
    .output(subscriptionStatusZod)
    .query(async ({ input, ctx }) => {
      const membership = await db.teamMembers.findBy({
        teamId: input.teamId,
        userId: ctx.user.userId,
        removedAt: null,
      })
      
      if (!membership) throw new Error('Not a team member')
      
      return await getSubscriptionStatus(input.teamId, ctx.user.userId)
    }),
}
```

### 8.5 Sync Endpoints

#### Sync Pending Leads

```typescript
// modules/sync/sync.router.ts
export const syncRouter = {
  // Server-Sent Events subscription
  subscribe: rpcProtectedProcedure
    .input(z.object({ lastSyncAt: z.number() }))
    .subscription(async function*({ input, ctx }) {
      // Send initial changes
      yield await getChangesSince(ctx.user.userId, input.lastSyncAt)
      
      // Subscribe to real-time changes
      for await (const change of syncService.subscribe(ctx.user.userId)) {
        yield change
      }
    }),
  
  // Manual sync endpoint (fallback)
  syncLeads: rpcProtectedProcedure
    .input(z.object({
      teamId: z.string().ulid().optional(),
      leads: z.array(pendingLeadZod),
    }))
    .output(z.object({
      synced: z.number(),
      failed: z.number(),
      results: z.array(z.object({
        pendingId: z.string(),
        status: z.enum(['success', 'failed']),
        leadId: z.string().ulid().optional(),
        error: z.string().optional(),
      })),
    }))
    .mutation(async ({ input, ctx }) => {
      // Check subscription if team context
      if (input.teamId) {
        const isSubscribed = await isUserSubscribed(ctx.user.userId, input.teamId)
        if (!isSubscribed) {
          throw new Error('No active subscription')
        }
      }
      
      const results = []
      let synced = 0
      let failed = 0
      
      for (const pendingLead of input.leads) {
        try {
          const leadId = await createLeadFromPending(pendingLead, ctx.user.userId)
          results.push({
            pendingId: pendingLead.pendingId,
            status: 'success',
            leadId,
          })
          synced++
        } catch (error) {
          results.push({
            pendingId: pendingLead.pendingId,
            status: 'failed',
            error: error.message,
          })
          failed++
        }
      }
      
      return { synced, failed, results }
    }),
}
```

---

## 9. Implementation Phases

### Phase 1: Monorepo Setup (Days 1-3)

**Infrastructure:**
- [ ] Initialize Turborepo with Yarn workspaces
- [ ] Configure Biome (tabs, 100 chars, double quotes)
- [ ] Set up shared packages structure
- [ ] Configure TypeScript configs
- [ ] Set up Docker Compose (PostgreSQL)

**Deliverables:**
- Working monorepo structure
- Build pipeline configured
- Code quality tools active

### Phase 2: Backend Foundation (Days 4-8)

**Database:**
- [ ] Configure Orchid ORM
- [ ] Create base tables (users, leads, tags)
- [ ] Set up migrations system
- [ ] Create pg-tbus event schema

**API:**
- [ ] Set up oRPC server
- [ ] Configure Better Auth
- [ ] Create base procedures (public, protected, sensitive)
- [ ] Implement health check endpoint

**Events:**
- [ ] Set up pg-tbus
- [ ] Create event handlers structure
- [ ] Implement sync service

**Deliverables:**
- Database schema deployed
- Auth endpoints working
- Base API structure ready

### Phase 3: Frontend Foundation (Days 9-13)

**Setup:**
- [ ] Initialize React + Vite app
- [ ] Configure MUI v7 theme
- [ ] Set up React Router 7
- [ ] Configure PWA (Vite PWA plugin)

**Data Worker:**
- [ ] Create Web Worker infrastructure
- [ ] Implement TinyBase schema
- [ ] Build StorageEngine (IndexedDB)
- [ ] Create SyncManager
- [ ] Implement ConnectivityService

**State Management:**
- [ ] Set up Zustand stores
- [ ] Create worker hooks (useWorkerQuery, useWorkerMutation)
- [ ] Implement optimistic updates

**Deliverables:**
- Data Worker functional
- Local storage working
- Worker hooks ready

### Phase 4: Core Lead Features (Days 14-20)

> **Migration Note:** Application transformed from OneQ (journaling) to ExpoWiz (lead capture). Removed journal-entries and prompts modules. Database migration `0003_drop_oneq_tables.ts` drops old tables.

**Lead Capture:**
- [x] Build lead capture form
- [x] Implement camera integration (MediaCapture component with presigned S3 uploads)
- [x] Create image compression utility (MediaService with WebP compression)
- [x] Build voice recorder (MediaRecorder API with WebM format)
- [x] Dashboard instant capture widget

**Lead Management:**
- [x] Create lead list view (card/table toggle with pagination)
- [x] Build lead detail page (with media gallery)
- [x] Add media indicators to list views (card icons, table columns)
- [ ] Implement lead editing
- [ ] Create tag management

**Backend:**
- [x] Implement leads router (getAll, getById, create, delete)
- [x] Create leads table with sync hooks (afterCreateCommit, afterUpdateCommit, afterDeleteCommit)
- [x] Migration: Drop journal_entries and prompts tables
- [x] Migration 0004: Add media fields (visitingCardFrontUrl, visitingCardBackUrl, voiceNoteUrl)
- [x] Create media router with presigned URL generation (DigitalOcean Spaces)
- [x] S3 service for direct-to-cloud uploads
- [ ] Create tags router

**Deliverables:**
- Capture leads locally
- View and edit leads
- Tags working

### Phase 5: Sync & Real-Time (Days 21-26)

**Sync Implementation:**
- [ ] Complete SyncManager drain logic
- [ ] Implement exponential backoff
- [ ] Build conflict resolution UI
- [ ] Add retry mechanisms

**Real-Time:**
- [ ] Implement SSE endpoint
- [ ] Subscribe to changes in Data Worker
- [ ] Handle remote updates

**Testing:**
- [ ] Test offline scenarios
- [ ] Test conflict resolution
- [ ] Test reconnection

**Deliverables:**
- Automatic sync working
- Real-time updates functional
- Conflict resolution ready

### Phase 6: Teams Foundation (Days 27-32)

**Database:**
- [ ] Create teams table
- [ ] Create team_members table
- [ ] Update leads table for team support

**Backend:**
- [ ] Implement teams router
- [ ] Create team members router
- [ ] Add permission checks

**Frontend:**
- [ ] Build workspace switcher
- [ ] Create team creation flow
- [ ] Implement member management

**Deliverables:**
- Create teams
- Switch workspaces
- Add/remove members

### Phase 7: Subscriptions (Days 33-38)

**Backend:**
- [ ] Create subscriptions table
- [ ] Implement subscriptions router
- [ ] Add Razorpay integration
- [ ] Create webhook handlers

**Frontend:**
- [ ] Build subscription UI
- [ ] Implement plan selection
- [ ] Create member selection
- [ ] Add status indicators

**Sync Logic:**
- [ ] Implement subscription checks
- [ ] Create pending leads system
- [ ] Build sync on activation

**Deliverables:**
- Purchase subscriptions
- Per-member pricing
- Pending leads sync

### Phase 8: Team Lead Management (Days 39-43)

**Visibility:**
- [ ] Workspace-aware lead loading
- [ ] Permission-based views
- [ ] Team leads page (Admin/Owner)

**Features:**
- [ ] Bulk export
- [ ] Statistics dashboard
- [ ] Lead filtering by member

**Testing:**
- [ ] Test role permissions
- [ ] Test subscription gating
- [ ] Test team switching

**Deliverables:**
- Team lead visibility
- Export functionality
- Complete team features

### Phase 9: Polish & Production (Days 44-50)

**UI/UX:**
- [ ] Mobile responsiveness
- [ ] Loading states
- [ ] Error handling
- [ ] Empty states

**Performance:**
- [ ] Image optimization
- [ ] Code splitting
- [ ] Bundle analysis

**Testing:**
- [ ] E2E tests with Playwright
- [ ] Unit tests with Vitest
- [ ] Mobile testing (Capacitor)

**Production:**
- [ ] Production database setup
- [ ] Environment configuration
- [ ] Monitoring (Sentry)
- [ ] SSL & security

**Deliverables:**
- Production-ready app
- Test suite passing
- Documentation complete

### Total Timeline: 50 Days

---

## 10. Edge Cases & Error Handling

### 10.1 Offline Scenarios

#### Network Intermittent During Capture
**Behavior:**
1. Detect offline via ConnectivityService
2. Save to TinyBase only
3. Create pending_entry
4. Show: "Saved offline. Will sync when connected."
5. Badge on sync indicator

#### Sync Fails After Max Retries
**Behavior:**
1. Mark as failed after 5 attempts
2. Show notification with retry button
3. Option to export unsynced data
4. Contact support link

#### Conflict Detected
**Behavior:**
1. Show conflict resolution modal
2. Display both versions side-by-side
3. Options: Use server / Use local / Merge manually
4. Default to server if no response in 30s

### 10.2 Team Scenarios

#### Owner Tries to Leave Team
**Behavior:**
- Disable leave button
- Show: "Transfer ownership before leaving"
- Link to ownership transfer flow

#### Last Admin Demotes Themselves
**Behavior:**
- Validation error: "Team must have at least one Admin"
- Suggest promoting another member

#### Member Removed While Active
**Behavior:**
- Immediate redirect to personal workspace
- Toast: "You've been removed from [Team Name]"
- Clear local team data

#### Subscription Expires Mid-Session
**Behavior:**
- Real-time check every 5 minutes
- Banner: "Subscription expired"
- New captures saved locally only
- Existing leads remain accessible

### 10.3 Data Integrity

#### Duplicate Lead Detection
**Strategy:**
- Match on email + phone
- Show: "Possible duplicate detected"
- Options: Merge / Create new / View existing

#### Database Connection Lost
**Behavior:**
- User-friendly error message
- No technical details exposed
- Auto-retry where safe
- Manual retry button

### 10.4 File Handling

#### Image Too Large
**Behavior:**
1. Client-side compression (WebP)
2. If still > 5MB: Error
3. Suggest reducing quality

#### Invalid File Type
**Behavior:**
- Block immediately
- Show: "Supported: JPG, PNG, WebP"
- Filter file picker

### 10.5 Error Codes

| Code | Scenario | Message |
|------|----------|---------|
| `AUTH_001` | Invalid credentials | "Invalid email or password" |
| `AUTH_002` | Session expired | "Please sign in again" |
| `LEAD_001` | Duplicate | "This lead may already exist" |
| `LEAD_002` | Validation | "Please check required fields" |
| `SYNC_001` | Sync failed | "Some leads failed to sync. Retry?" |
| `SYNC_002` | Conflict | "This lead was modified elsewhere" |
| `TEAM_001` | Duplicate name | "You already have a team with this name" |
| `TEAM_002` | Unauthorized | "You don't have permission" |
| `TEAM_003` | Owner leave | "Transfer ownership first" |
| `SUB_001` | No subscription | "No active subscription" |
| `SUB_002` | Payment failed | "Payment failed. Try again." |
| `FILE_001` | Too large | "File too large. Max 5MB." |
| `FILE_002` | Invalid type | "Use JPG, PNG, or WebP" |

---

## Appendix A: Environment Variables

```bash
# Database
DATABASE_URL=postgresql://user:pass@localhost:5432/expowiz
DATABASE_URL_TEST=postgresql://user:pass@localhost:5432/expowiz_test

# Better Auth
BETTER_AUTH_SECRET=your-secret-key
BETTER_AUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Razorpay
RAZORPAY_KEY_ID=rzp_test_xxx
RAZORPAY_KEY_SECRET=your-secret
RAZORPAY_WEBHOOK_SECRET=your-webhook-secret

# Frontend
VITE_API_URL=http://localhost:3000
VITE_APP_NAME=Expowiz
VITE_ENABLE_OFFLINE_SYNC=true

# Sentry (optional)
SENTRY_DSN=your-sentry-dsn

# Features
ENABLE_TEAMS=true
ENABLE_SUBSCRIPTIONS=true
```

---

## Appendix B: Monorepo Structure

```
expowiz/
├── apps/
│   ├── frontend/              # React + Vite app
│   │   ├── src/
│   │   │   ├── modules/       # Feature modules
│   │   │   │   ├── auth/
│   │   │   │   ├── leads/
│   │   │   │   ├── tags/
│   │   │   │   ├── teams/
│   │   │   │   └── subscriptions/
│   │   │   ├── worker/        # Data Worker
│   │   │   │   ├── data.worker.ts
│   │   │   │   ├── services/
│   │   │   │   └── stores/
│   │   │   ├── hooks/         # Custom hooks
│   │   │   ├── stores/        # Zustand stores
│   │   │   └── App.tsx
│   │   └── package.json
│   │
│   └── backend/               # Node.js + oRPC
│       ├── src/
│       │   ├── modules/       # Feature modules
│       │   │   ├── auth/
│       │   │   ├── leads/
│       │   │   ├── tags/
│       │   │   ├── teams/
│       │   │   ├── subscriptions/
│       │   │   └── sync/
│       │   ├── routers/       # oRPC routers
│       │   ├── events/        # pg-tbus events
│       │   ├── db/           # Database config
│       │   └── server.ts
│       └── package.json
│
├── packages/
│   ├── zod-schemas/          # Shared Zod schemas
│   ├── ui-mui/              # MUI components
│   └── typescript-config/   # Shared TS configs
│
├── turbo.json               # Turborepo config
├── biome.json              # Code formatting
├── docker-compose.yml      # Local services
└── package.json
```

---

## Appendix C: Key Commands

```bash
# Development
yarn dev                    # Start all apps
yarn dev --filter frontend  # Start frontend only
yarn dev --filter backend   # Start backend only

# Database
yarn db g <name>           # Generate migration
yarn db up                 # Apply migrations
yarn db down               # Rollback migration
yarn test:db:setup         # Setup test database

# Code Quality
yarn lint                  # Run Biome linter
yarn format               # Format code
yarn check-types          # TypeScript check

# Build
yarn build                # Build all workspaces
yarn build --filter frontend

# Testing
yarn test                 # Run all tests
yarn test --filter backend
yarn e2e                  # Run Playwright tests
```

---

**Document Status:** Complete - Aligned with Repository Architecture  
**Version:** 3.0  
**Last Updated:** February 6, 2026
