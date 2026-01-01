import { faker } from "@faker-js/faker";
import type { JournalEntryCreateInput } from "./journal_entry.zod.js";

export const createJournalEntryFixture = (input?: Partial<JournalEntryCreateInput>) => ({
  content: faker.lorem.paragraphs(),
  prompt: faker.lorem.sentence(),
  ...input
})