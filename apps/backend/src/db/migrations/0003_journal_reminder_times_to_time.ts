import { change } from "../db_script";

// Not strictly "additive-only" per ADR-B01, but this column is empty on
// every row (the feature never shipped), so a direct type change is safe.
// If we ever need to alter a populated array column of the same shape,
// use an additive add + backfill + drop pair instead.
//
// rake-db auto-emits `USING "journal_reminder_times"::text[]::time[]` for
// array-column type changes, so any environment that DID have values like
// "09:00" migrates cleanly. Invalid time literals will fail loudly — which
// is what we want (data corruption caught here beats silent NULLs).
change(async (db) => {
	await db.changeTable("users", (t) => ({
		journalReminderTimes: t.change(
			t.array(t.string()).default([]),
			t.array(t.time()).default([]),
		),
	}));
});
