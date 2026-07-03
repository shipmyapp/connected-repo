import type { AppDbTable } from "../db/db.manager";

/**
 * In-memory edit-lock registry.
 *
 * Edit screens `lock(table, id)` on mount, `release(table, id)` on unmount.
 * The push pipeline in `sync.orchestrator.ts` consults `isLocked(table, id)`
 * before pushing a row so a mid-edit local write can't be clobbered by a
 * server round-trip landing between keystrokes.
 *
 * The registry is per-worker-context and reset on reload — that's fine:
 * a reload aborts any in-flight edit UI too.
 *
 * NOTE: Because the pending-vs-confirmed lifecycle in this app currently
 * only spans CREATE (via `pushCreates`) and edits to confirmed rows go
 * through immediate server calls (see `updateOnlineFirst`), the lock is
 * a belt-and-suspenders guard for the "user typing on a row that's
 * being reconciled" case. Cheap enough to have even if only a few paths
 * use it today.
 */

type Key = `${AppDbTable}:${string}`;

const locked = new Set<Key>();

const keyOf = (table: AppDbTable, id: string): Key => `${table}:${id}`;

export const pendingEditLockRegistry = {
	lock(table: AppDbTable, id: string): void {
		locked.add(keyOf(table, id));
	},

	release(table: AppDbTable, id: string): void {
		locked.delete(keyOf(table, id));
	},

	isLocked(table: AppDbTable, id: string): boolean {
		return locked.has(keyOf(table, id));
	},

	/** Bulk filter — returns only the ids that are NOT locked. */
	filterUnlocked<T extends { id: string }>(
		table: AppDbTable,
		rows: readonly T[],
	): T[] {
		return rows.filter((r) => !locked.has(keyOf(table, r.id)));
	},

	/** Test/debug helper — never call from production paths. */
	_clearAll(): void {
		locked.clear();
	},
};
