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
		updateMany: async ({ model, where, update: values }) => {
			const modelName = validateModel(model);
			const query = applyBetterAuthWhere(db[modelName], where);
			return await query.selectAll().update(values);
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
