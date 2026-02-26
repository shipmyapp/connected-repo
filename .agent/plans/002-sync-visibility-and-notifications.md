# Plan: Sync Visibility & Proactive Notifications

## Objective
Increase user awareness of "Pending Sync" data through visual cues and system notifications to prevent data loss or staleness.

## Proposed Strategy

### 1. In-App Sync Banner
- **Component**: Create a `SyncStatusBanner` (or extend `OfflineBanner`) that appears when `countPending > 0`.
- **Logic**: 
    - Queries the `DataWorker` for the total count of unsynced journal entries and files.
    - Displays a non-intrusive banner: "You have X unsynced entries. [Sync Now]".
    - Provides immediate visual feedback when the count decreases during sync.

### 2. App Icon Badging
- **API**: [App Badging API](https://developer.mozilla.org/en-US/docs/Web/API/Badging_API).
- **Implementation**:
    - The `DataWorker` (via `db.manager.ts` subscribers) updates the badge count whenever the pending table changes.
    - `navigator.setAppBadge(pendingCount)` to show a number on the mobile/desktop app icon.
    - `navigator.clearAppBadge()` when sync completes.

### 3. Proactive Sync Reminders (Push/Local Notifications)
- **Logic**:
    - If data remains unsynced for more than a threshold (e.g., 2 hours), trigger a system notification.
    - **Offline Reminder**: Since the device might be offline, the `Service Worker` can use the `Background Sync API` or a periodic watchdog to check the local DB.
- **Message**: "Tezi: You have pending entries that haven't synced yet. Open the app to secure your data."
- **Deep Link**: Clicking the notification opens the app directly to the "Pending Sync" list.
### 4. "Unsaved Changes" Guard (BeforeUnload)
- **Logic**: Add a listener to the `beforeunload` event.
- **Trigger**: Only activate if `countPending > 0`.
- **Message**: "You have unsynced journal entries. If you leave now, they may not be secured to the server."

## Success Criteria
- The app icon shows a badge with the correct number of pending items.
- A banner appears and disappears dynamically as items sync.
- A notification appears in the system drawer if the user closes the app with pending data.
