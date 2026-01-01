import { seedPrompts } from "@backend/db/seed/prompts.seed";

export const seed = async () => {
	console.info("Seeding database...");

	await seedPrompts();

	console.info("Seeding completed successfully!");
};

