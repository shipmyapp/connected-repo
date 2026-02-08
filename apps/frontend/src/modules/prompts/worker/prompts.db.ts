import { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import { db, notifySubscribers } from "../../../worker/db/db.manager";

export class PromptsDBManager {
  async bulkDelete(prompts: PromptSelectAll[]) {
    // Prompts are soft-deleted on the backend, so we just upsert the state
    await this.bulkUpsert(prompts);
  }

  async bulkUpsert(prompts: PromptSelectAll[]) {
    await db.prompts.bulkPut(prompts);
    notifySubscribers("prompts");
  }

  async upsert(prompt: PromptSelectAll) {
    await db.prompts.put(prompt);
    notifySubscribers("prompts");
  }

  getAll() {
    return db.prompts.toArray();
  }

  async getLatestUpdatedAt() {
    return db.prompts.orderBy("updatedAt").reverse().first();
  }
}

export const promptsDb = new PromptsDBManager();
