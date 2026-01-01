import { envSchemaZod } from "@frontend/utils/env_validator.zod.utils";

export const env = envSchemaZod.parse(import.meta.env);

export const isTest = env.VITE_USER_NODE_ENV === "test";
