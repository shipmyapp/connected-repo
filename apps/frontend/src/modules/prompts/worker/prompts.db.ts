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

  async getRandomActive(teamId: string | null = null) {
    const query = teamId 
      ? db.prompts.where("teamId").equals(teamId).and(p => !p.deletedAt)
      : db.prompts.filter(p => !p.teamId && !p.deletedAt);
    
    const active = await query.toArray();
    
    if (active.length === 0) {
      console.warn(`[PromptsDB] No active prompts found for teamId: ${teamId}`);
      return null;
    }
    return active[Math.floor(Math.random() * active.length)];
  }

  getLatestUpdatedAt() {
    return db.prompts.orderBy("updatedAt").reverse().first();
  }
}

export const promptsDb = new PromptsDBManager();
