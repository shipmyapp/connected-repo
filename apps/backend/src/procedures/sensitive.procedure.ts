import { rpcSessionSecurityMiddleware } from "@backend/middlewares/session-security.middleware";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";

export const rpcSensitiveProcedure = rpcProtectedProcedure
	.use(rpcSessionSecurityMiddleware("strict"));
