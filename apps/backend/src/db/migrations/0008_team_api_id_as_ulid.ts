import { sql } from "@backend/db/base_table";
import { change } from "../db_script";

// The API team id is a ULID (`teams_api.team_api_id varchar(26)`), but the
// three tables that point at it were created with `uuid`, so every write with
// a real team id failed ("invalid input syntax for type uuid"). Not
// expand/contract (ADR-B01): no row can hold a real team id today, so the
// type changes in place. A uuid-shaped value already present (36 characters)
// would not fit varchar(26): count the rows of the three tables before
// deploying; a non-zero count needs a look first. Rolling back casts the
// text back to uuid, which works only while no ULID is stored.
const backToUuid = { usingDown: sql`team_api_id::uuid` };

change(async (db) => {
	await db.changeTable("subscriptions", (t) => ({
		teamApiId: t.change(t.uuid(), t.string(26), backToUuid),
	}));
	await db.changeTable("api_product_request_logs", (t) => ({
		teamApiId: t.change(t.uuid(), t.string(26), backToUuid),
	}));
	await db.changeTable("pg_tbus_task_log", (t) => ({
		teamApiId: t.change(t.uuid().nullable(), t.string(26).nullable(), backToUuid),
	}));
});
