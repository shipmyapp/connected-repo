import { sql } from "@backend/db/base_table";
import type { Db } from "@backend/db/db";
import { applyJoins } from "@backend/modules/auth/orchid-adapter/join_query_builder.orchid_adapter";
import { validateModel, validateSelect } from "@backend/modules/auth/orchid-adapter/model_table_map.orchid_adapter";
import { applyBetterAuthWhere } from "@backend/modules/auth/orchid-adapter/where_query_builder.orchid_adapter";
import type { AdapterFactoryCustomizeAdapterCreator } from "@better-auth/core/db/adapter";

export const createCustomAdapterOrchid = (db: Db): AdapterFactoryCustomizeAdapterCreator =>
  () => ({
    // @ts-expect-error
    create: async ({ model, data, select }) => {
      const modelName = validateModel(model);
      const validatedSelect = validateSelect(modelName, select);
      const result = await db[modelName]
        .create(data)
        // @ts-expect-error
        .select(...validatedSelect);

      return result;
    },
    update: async ({ model, where, update: values }) => {
      const modelName = validateModel(model);
      const query = applyBetterAuthWhere(db[modelName], where);
      return await query.take().selectAll().update(values);
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
    findMany: async ({ model, where, sortBy, limit, offset, join }) => {
      const modelName = validateModel(model);
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
      
      return await joinedQuery.selectAll();
    },
    count: ({ model, where }) => {
      const modelName = validateModel(model);
      const query = applyBetterAuthWhere(db[modelName], where);
      return query.count();
    },
    deleteMany: async ({ model, where }) => {
      const modelName = validateModel(model);
      const query = applyBetterAuthWhere(db[modelName], where);
      if( model === "sessions") {
        return await query.update({
          markedInvalidAt: sql`CURRENT_TIMESTAMP`
        })
      }
      return await query.delete();
    }
  });