import { BaseTable } from "@backend/db/base_table";

export class VerificationTable extends BaseTable {
	readonly table = "verifications";

	// `id` PK is required by better-auth's OAuth callback: after Google
	// redirects back, better-auth looks up the state row by identifier, then
	// deletes it by id. Without an id column, the delete resolves to
	// `WHERE id = undefined`, which orchid rejects as an unconditional delete.
	columns = this.setColumns(
		(t) => ({
			id: t.ulidWithDefault().primaryKey(),
			identifier: t.string(),
			value: t.text(),
			expiresAt: t.timestampNumber(),
			...t.timestampsAsNumbers(),
		}),
		(t) => [t.index(["identifier"])],
	);
}
