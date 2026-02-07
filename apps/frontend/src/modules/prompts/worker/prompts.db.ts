import { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import { db, notifySubscribers } from "../../../worker/db/db.manager";

export class PromptsDBManager {
  async upsertPrompt(prompt: PromptSelectAll) {
    await db.prompts.put(prompt);
    notifySubscribers("prompts");
  }

  async getAllPrompts() {
    return await db.prompts.toArray();
  }
}

export const promptsDb = new PromptsDBManager();
