import { cronJobAuthMiddleware } from "@backend/middlewares/cron-job-auth.middleware";
import { openApiPublicProcedure } from "@backend/procedures/open_api_public.procedure";

// Cron job authenticated procedure - requires Authorization Bearer token
export const cronJobAuthProcedure = openApiPublicProcedure
  .use(cronJobAuthMiddleware);