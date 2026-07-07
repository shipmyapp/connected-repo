import { z } from "zod";
import { promptSelectAllZod } from "../prompt.zod.js";
import { makePullBundlesOutput, syncDeltaInputZod } from "../sync.zod.js";

export const promptsPullBundlesInputZod = syncDeltaInputZod;
export type PromptsPullBundlesInput = z.infer<typeof promptsPullBundlesInputZod>;

export const promptsPullBundlesOutputZod = makePullBundlesOutput(promptSelectAllZod);
export type PromptsPullBundlesOutput = z.infer<typeof promptsPullBundlesOutputZod>;
