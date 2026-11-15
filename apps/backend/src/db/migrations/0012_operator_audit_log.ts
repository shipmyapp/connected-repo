import { change } from "../db_script";

// Every change an operator makes from the super-admin console: who, what, on
// which target, the value before and after, why, when and from which IP.
// Append-only (the app never updates or deletes a row). No foreign key to
// users: a row outlives the operator's account, and actor_email keeps who
// it was.
change(async (db) => {
	await db.createTable(
		"operator_audit_log",
		(t) => ({
			id: t.string(26).primaryKey(),
			actorUserId: t.uuid(),
			actorEmail: t.string(320).nullable(),
			action: t.string(100),
			targetKind: t.string(40),
			targetId: t.string(100).nullable(),
			before: t.json().nullable(),
			after: t.json().nullable(),
			reason: t.string(300).nullable(),
			ipAddress: t.string(64).nullable(),
			createdAt: t.timestamps().createdAt,
			updatedAt: t.timestamps().updatedAt,
		}),
		(t) => [
			t.index([{ column: "createdAt", order: "DESC" }]),
			t.index(["targetKind", "targetId"]),
			t.index(["actorUserId", { column: "createdAt", order: "DESC" }]),
		],
	);
});
