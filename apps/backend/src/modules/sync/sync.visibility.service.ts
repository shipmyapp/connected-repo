import { db } from "@backend/db/db";

export class SyncVisibilityService {
	/**
	 * Returns a list of team IDs where the user has Admin or Owner roles.
	 */
	async getAdminOrOwnerTeamIds(userId: string): Promise<string[]> {
		const memberships = await db.teamMembers
			.where({ userId, role: { in: ["Owner", "Admin"] } })
			.select("teamAppId");
		
		return memberships.map(m => m.teamAppId);
	}

	/**
	 * Returns an Orchid-ORC query filter for Journal Entries visible to the user.
	 * Rule: (Author is user) OR (Team ID is one where user is Admin/Owner)
	 */
	async getJournalEntryVisibilityFilter(userId: string) {
		const adminTeamIds = await this.getAdminOrOwnerTeamIds(userId);

		const filter: any = {
			OR: [
				{ authorUserId: userId },
			]
		};

		if (adminTeamIds.length > 0) {
			filter.OR.push({ teamId: { in: adminTeamIds } });
		}

		return filter;
	}

	/**
	 * Returns a list of user IDs who should be notified about a change to a journal entry.
	 * Rule: Author + all Admins/Owners of the associated team.
	 */
	async getUsersToNotifyForEntry(teamId: string | null, authorUserId: string): Promise<string[]> {
		const userIds = new Set<string>([authorUserId]);

		if (teamId) {
			const partners = await db.teamMembers
				.where({ teamAppId: teamId, role: { in: ["Owner", "Admin"] } })
				.select("userId");
			
			for (const p of partners) {
				if (p.userId) userIds.add(p.userId);
			}
		}

		return Array.from(userIds);
	}
}

export const syncVisibilityService = new SyncVisibilityService();
