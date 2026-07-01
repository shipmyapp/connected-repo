import { z } from "zod";
import { promptSelectAllZod } from "../prompt.zod.js";
import { syncDeltaInputZod, syncMetadataZod } from "../sync.zod.js";

export const promptsPullBundlesInputZod = syncDeltaInputZod;
export type PromptsPullBundlesInput = z.infer<typeof promptsPullBundlesInputZod>;

export const promptsPullBundlesOutputZod = z.object({
	rows: z.array(promptSelectAllZod),
	syncMetadata: syncMetadataZod,
});
export type PromptsPullBundlesOutput = z.infer<typeof promptsPullBundlesOutputZod>;
