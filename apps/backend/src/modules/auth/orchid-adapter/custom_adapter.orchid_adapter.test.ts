import { db } from "@backend/db/db";
import { createCustomAdapterOrchid } from "@backend/modules/auth/orchid-adapter/custom_adapter.orchid_adapter";
import { defaultContext } from "@backend/test/setup";
import type {
	AdapterFactoryCustomizeAdapterCreator,
	CleanedWhere,
} from "@better-auth/core/db/adapter";
import { describe, expect, it } from "vitest";

// The better-auth adapter contract (@better-auth/core/db/adapter) declares
//   update: <T>(...) => Promise<T | null>
// The `| null` is load-bearing: it's how better-auth signals "row didn't
// match" without blowing up the caller. The stock reference adapters return
// null in that case; our custom Orchid adapter used to throw NotFoundError
// (via .take()), which surfaces as a 500 from the auth handler on any
// benign race — e.g. session refresh landing microseconds after expiresAt.
//
// These tests pin the contract at the adapter layer, so any future
// regression (someone re-adding .take(), or the default scope changing)
// fails a test rather than a session refresh in production.

// The raw creator's declared TS arity is 1 (a config object with schema /
// getModelName / debugLog / …) that the current implementation doesn't
// actually read. Passing an empty object cast to the parameter type keeps
// the runtime happy without dragging the full better-auth factory setup
// into a unit test.
const rawCreatorArg = {} as Parameters<AdapterFactoryCustomizeAdapterCreator>[0];
const eq = (field: string, value: string): CleanedWhere => ({
	field,
	value,
	operator: "eq",
	connector: "AND",
	mode: "sensitive",
});

describe("createCustomAdapterOrchid — update contract", () => {
	const adapter = createCustomAdapterOrchid(db)(rawCreatorArg);

	it("returns null when no session row matches the where clause", async () => {
		const result = await adapter.update({
			model: "sessions",
			where: [eq("id", "does-not-exist-01234567890123")],
			update: { markedInvalidAt: Date.now() },
		});

		expect(result).toBeNull();
	});

	it("returns the updated row when a matching session exists", async () => {
		const sessionId = defaultContext?.session.id;
		expect(sessionId).toBeDefined();
		if (!sessionId) throw new Error("expected a session in the test context");

		const newIp = "203.0.113.42";
		const result = await adapter.update({
			model: "sessions",
			where: [eq("id", sessionId)],
			update: { ipAddress: newIp },
		});

		expect(result).not.toBeNull();
		expect((result as { ipAddress: string }).ipAddress).toBe(newIp);

		// And the write actually landed.
		const persisted = await db.sessions.where({ id: sessionId }).takeOptional();
		expect(persisted?.ipAddress).toBe(newIp);
	});

	// This is the race the reviewer specifically called out: a session
	// crosses expiresAt or is marked-invalid between the read and the write.
	// SessionTable's default scope filters both out, so the update matches
	// zero rows. Under the old .take() implementation this threw and became
	// a 500 in better_auth.handler; under the fix it must return null.
	it("returns null when the row exists but is hidden by the table's default scope", async () => {
		const sessionId = defaultContext?.session.id;
		expect(sessionId).toBeDefined();
		if (!sessionId) throw new Error("expected a session in the test context");

		// Bypass the default scope to flip the row into "invalid" state.
		await db.sessions
			.unscope("default")
			.where({ id: sessionId })
			.update({ markedInvalidAt: Date.now() });

		const result = await adapter.update({
			model: "sessions",
			where: [eq("id", sessionId)],
			update: { ipAddress: "198.51.100.7" },
		});

		expect(result).toBeNull();

		// And the row was NOT mutated by the update call (default scope
		// blocked it upstream — the row's ipAddress must be unchanged).
		const persisted = await db.sessions.unscope("default").where({ id: sessionId }).take();
		expect(persisted.ipAddress).not.toBe("198.51.100.7");
	});
});

describe("createCustomAdapterOrchid — counts and one-time rows", () => {
	const adapter = createCustomAdapterOrchid(db)(rawCreatorArg);
	const verification = (identifier: string) =>
		db.verifications.create({
			identifier,
			value: "secret",
			expiresAt: Date.now() + 60_000,
		});

	it("updateMany returns the number of rows it changed", async () => {
		await verification("count-a");
		await verification("count-a");
		const changed = await adapter.updateMany({
			model: "verifications",
			where: [eq("identifier", "count-a")],
			update: { value: "changed" },
		});
		expect(changed).toBe(2);
	});

	it("consumeOne hands a row to one caller only", async () => {
		const row = await verification("consume-a");
		const [first, second] = await Promise.all([
			adapter.consumeOne?.({ model: "verifications", where: [eq("id", row.id)] }),
			adapter.consumeOne?.({ model: "verifications", where: [eq("id", row.id)] }),
		]);
		expect([first, second].filter(Boolean)).toHaveLength(1);
		expect(await db.verifications.where({ id: row.id }).takeOptional()).toBeUndefined();
	});

	it("incrementOne writes only while its where still matches", async () => {
		const row = await verification("guard-a");
		const guarded = [eq("id", row.id), eq("value", "secret")];
		const updated = await adapter.incrementOne?.({
			model: "verifications",
			where: guarded,
			increment: {},
			set: { value: "rotated" },
		});
		expect(updated).toMatchObject({ id: row.id, value: "rotated" });
		const again = await adapter.incrementOne?.({
			model: "verifications",
			where: guarded,
			increment: {},
			set: { value: "rotated twice" },
		});
		expect(again).toBeNull();
	});
});
