import type { CreateWorkflowDto } from "@novu/api/models/components";

/**
 * A Novu workflow as the code holds it. `updatedAt` (ISO 8601, UTC) is when
 * this copy last changed: `yarn novu:pull` sets it to the dashboard's time,
 * and a person editing the file by hand sets it to now. At boot the newer
 * of the code and the dashboard wins (ensureNovuWorkflows).
 */
export type CodeWorkflow = {
	updatedAt: string;
	definition: (input: { appUrl: string }) => CreateWorkflowDto;
};
