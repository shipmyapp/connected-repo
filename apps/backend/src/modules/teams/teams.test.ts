import { teamsAppRouter } from '@backend/modules/teams/teams_app.router.js';
import { defaultContext } from '@backend/test/setup';
import { createRouterClient, type RouterClient } from '@orpc/server';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '@backend/db/db';

describe('Teams App Endpoints', () => {
	let defaultClient: RouterClient<typeof teamsAppRouter>;

	beforeEach(() => {
		defaultClient = createRouterClient(teamsAppRouter, {
			context: defaultContext,
		});
	});

	describe('getDefaultTeam', () => {
		it('should create a personal team if none exists and set it as default', async () => {
			// Ensure user has no default team and no personal team
			await db.users.where({ id: defaultContext!.user.id }).update({ defaultTeamAppId: null });
			await db.teamsApp.where({ personalTeamForUserId: defaultContext!.user.id }).delete();

			const result = await defaultClient.getDefaultTeam({});

			expect(result).toBeDefined();
			expect(result.personalTeamForUserId).toBe(defaultContext!.user.id);
			expect(result.name).toBe(`${defaultContext!.user.name.split(" ")[0]}'s Team`);

			// Verify user's defaultTeamAppId is updated
			const user = await db.users.where({ id: defaultContext!.user.id }).take();
			expect(user.defaultTeamAppId).toBe(result.id);

			// Verify membership
			const membership = await db.teamMembers.where({ teamId: result.id, userId: defaultContext!.user.id }).take();
			expect(membership.role).toBe('Owner');
		});

		it('should return existing personal team if it exists but is not set as default', async () => {
			// Create a personal team manually
			const team = await db.teamsApp.create({
				name: "Manual Team",
				createdByUserId: defaultContext!.user.id,
				personalTeamForUserId: defaultContext!.user.id,
			});
			
			// Ensure user has no default team set
			await db.users.where({ id: defaultContext!.user.id }).update({ defaultTeamAppId: null });

			const result = await defaultClient.getDefaultTeam({});

			expect(result.id).toBe(team.id);
			
			// Verify user's defaultTeamAppId is updated
			const user = await db.users.where({ id: defaultContext!.user.id }).take();
			expect(user.defaultTeamAppId).toBe(team.id);
		});

		it('should return existing default team if set', async () => {
			const team = await db.teamsApp.create({
				name: "Existing Default",
				createdByUserId: defaultContext!.user.id,
			});
			await db.users.where({ id: defaultContext!.user.id }).update({ defaultTeamAppId: team.id });

			const result = await defaultClient.getDefaultTeam({});

			expect(result.id).toBe(team.id);
			expect(result.name).toBe("Existing Default");
		});
	});
});
