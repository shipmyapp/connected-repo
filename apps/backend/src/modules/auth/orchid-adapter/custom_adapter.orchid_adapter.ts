import { sql } from "@backend/db/base_table";
import type { Db } from "@backend/db/db";
import { applyJoins } from "@backend/modules/auth/orchid-adapter/join_query_builder.orchid_adapter";
import {
	validateModel,
	validateSelect,
} from "@backend/modules/auth/orchid-adapter/model_table_map.orchid_adapter";
import { applyBetterAuthWhere } from "@backend/modules/auth/orchid-adapter/where_query_builder.orchid_adapter";
import type { AdapterFactoryCustomizeAdapterCreator } from "@better-auth/core/db/adapter";
import { NotFoundError } from "orchid-orm";

const INCREMENT_ATTEMPTS = 5;

export const createCustomAdapterOrchid =
	(db: Db): AdapterFactoryCustomizeAdapterCreator =>
	() => ({
		// @ts-expect-error
		create: async ({ model, data, select }) => {
			const modelName = validateModel(model);
			const validatedSelect = validateSelect(modelName, select);
			const result = await db[modelName]
				// Better-auth passes untyped `data`; orchid 1.72's stricter
				// ExtraPropertiesAreNotAllowed check can't validate it. The adapter
				// relies on better-auth's own field validation upstream.
				.create(data as never)
				// @ts-expect-error
				.select(...validatedSelect);

			return result;
		},
		// better-auth's adapter contract for single-row update is
		// `Promise<T | null>` — null signals "no row matched" without
		// throwing. Orchid's `.take()` throws NotFoundError on zero rows,
		// which would surface as a 500 from better_auth.handler on any
		// benign race (e.g. session refresh landing microseconds after
		// expiresAt, or a row falling out of the table's default scope
		// between the read and the write). Catch that specific error and
		// map to null; let anything else propagate. Pinned by
		// custom_adapter.orchid_adapter.test.ts.
		update: async ({ model, where, update: values }) => {
			const modelName = validateModel(model);
			const query = applyBetterAuthWhere(db[modelName], where);
			try {
				return await query.take().selectAll().update(values);
			} catch (err) {
				if (err instanceof NotFoundError) return null;
				throw err;
			}
		},
		// The affected-row count: Better Auth refuses anything else.
		updateMany: async ({ model, where, update: values }) => {
			const modelName = validateModel(model);
			const query = applyBetterAuthWhere(db[modelName], where);
			return await query.update(values);
		},
		delete: async ({ model, where }) => {
			const modelName = validateModel(model);
			const query = applyBetterAuthWhere(db[modelName], where);
			return await query.delete();
		},
		findOne: async ({ model, where, select, join }) => {
			const modelName = validateModel(model);
			const validatedSelect = validateSelect(modelName, select);
			const query = applyBetterAuthWhere(db[modelName], where);

			// Apply joins and get the select fields
			const joinedQuery = applyJoins(query, join, db);

			return await joinedQuery.select(...validatedSelect).takeOptional();
		},
		findMany: async ({ model, where, sortBy, limit, offset, join, select }) => {
			const modelName = validateModel(model);
			const validatedSelect = validateSelect(modelName, select);
			let query = applyBetterAuthWhere(db[modelName], where);

			if (sortBy) {
				query = query.order({
					[sortBy.field]: sortBy.direction.toLowerCase() === "asc" ? "ASC" : "DESC",
				});
			}

			if (limit !== undefined) {
				query = query.limit(limit);
			}

			if (offset !== undefined) {
				query = query.offset(offset);
			}

			// Apply joins and get the select fields
			const joinedQuery = applyJoins(query, join, db);

			return await joinedQuery.select(...validatedSelect);
		},
		count: async ({ model, where }) => {
			const modelName = validateModel(model);
			const query = applyBetterAuthWhere(db[modelName], where);
			return await query.count();
		},
		// Single-use rows (verification values). One DELETE … RETURNING: of two
		// concurrent callers only the first gets the row, the other none.
		consumeOne: async ({ model, where }) => {
			const modelName = validateModel(model);
			const row = await applyBetterAuthWhere(db[modelName], where).select("id").takeOptional();
			if (!row) return null;
			const [deleted] = await applyBetterAuthWhere(db[modelName], where)
				.where({ id: row.id })
				.selectAll()
				.delete();
			return deleted ?? null;
		},
		// Guarded one-row updates (refresh-token rotation, counters). The UPDATE
		// repeats the where and the counters' values as read, so a row another
		// caller changed in between is not written; that read is retried.
		incrementOne: async ({ model, where, increment, set }) => {
			const modelName = validateModel(model);
			for (let attempt = 0; attempt < INCREMENT_ATTEMPTS; attempt++) {
				const row = await applyBetterAuthWhere(db[modelName], where).selectAll().takeOptional();
				if (!row) return null;
				const stored: Record<string, unknown> = { ...row };
				const guard: Record<string, unknown> = { id: row.id };
				const values: Record<string, unknown> = {};
				for (const [field, value] of Object.entries(set ?? {})) {
					if (value !== undefined) values[field] = value;
				}
				for (const [field, delta] of Object.entries(increment)) {
					const current = stored[field] ?? null;
					guard[field] = current;
					values[field] = (typeof current === "number" ? current : 0) + delta;
				}
				const [updated] = await applyBetterAuthWhere(db[modelName], where)
					.where(guard)
					.selectAll()
					.update(values as never);
				if (updated) return updated;
				if (Object.keys(increment).length === 0) return null;
			}
			throw new Error(`incrementOne on ${modelName}: the row kept changing; not written.`);
		},
		deleteMany: async ({ model, where }) => {
			const modelName = validateModel(model);
			const query = applyBetterAuthWhere(db[modelName], where);
			if (model === "sessions") {
				return await query.update({
					markedInvalidAt: sql`CURRENT_TIMESTAMP`,
				});
			}
			return await query.delete();
		},
	});
