import { PromptSelectAll } from "@connected-repo/zod-schemas/prompt.zod";
import { clientDb, notifySubscribers, type WithSync } from "../../../worker/db/db.manager";

export class PromptsDBManager {
  async bulkDelete(prompts: PromptSelectAll[]) {
    // Prompts are soft-deleted on the backend, so we just upsert the state
    await this.bulkUpsert(prompts);
  }

  async bulkUpsert(prompts: PromptSelectAll[]) {
    const data: WithSync<PromptSelectAll>[] = prompts.map(p => ({
      ...p,
      _pendingAction: null,
      clientUpdatedAt: p.updatedAt,
    }));
    await clientDb.prompts.bulkPut(data);
    notifySubscribers("prompts");
  }

  async upsert(prompt: PromptSelectAll) {
    const data: WithSync<PromptSelectAll> = {
      ...prompt,
      _pendingAction: null,
      clientUpdatedAt: prompt.updatedAt,
    };
    await clientDb.prompts.put(data);
    notifySubscribers("prompts");
  }

  getAll() {
    return clientDb.prompts.toArray();
  }

  async getRandomActive(teamId: string | null = null) {
    const query = teamId 
      ? clientDb.prompts.where("teamId").equals(teamId).and(p => !p.deletedAt)
      : clientDb.prompts.filter(p => !p.teamId && !p.deletedAt);
    
    const active = await query.toArray();
    
    if (active.length === 0) {
      console.warn(`[PromptsDB] No active prompts found for teamId: ${teamId}`);
      return null;
    }
    return active[Math.floor(Math.random() * active.length)];
  }

  getLatestUpdatedAt() {
    return clientDb.prompts.orderBy("updatedAt").reverse().first();
  }
}

export const promptsDb = new PromptsDBManager();
