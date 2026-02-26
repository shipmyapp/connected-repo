# Plan: Sync Visibility & Feedback (004)

## Objective
Increase user awareness of "Pending Sync" data through visual cues and system notifications to prevent data loss or staleness.

## Context
User requested earlier implementation of visibility to ensure they know their data is safe.

## Proposed Strategy

### 1. In-App Sync Banner
- **Component**: Create a `SyncStatusBanner` that appears when `countPending > 0`.
- **Logic**: Queries `DataWorker` for total count of unsynced items.

### 2. App Icon Badging
- **API**: [App Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API).
- **Implementation**: `navigator.setAppBadge(pendingCount)` updated via `db.manager.ts` subscribers.

### 3. Proactive Sync Reminders
- **Logic**: Trigger a system notification if data remains unsynced for > 2 hours.
- **Service Worker**: Use `Background Sync API` watchdog.

### 4. "Unsaved Changes" Guard
- **Logic**: Add `beforeunload` listener if `countPending > 0`.

## Success Criteria
- App icon shows badge with correct number.
- Banner appears/disappears dynamically.
- System notification appears if app is closed with pending data.
