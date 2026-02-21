import { db } from "@backend/db/db";

export const getTeamMembersDelta = async (
		userId: string,
		userOwnerAdminTeamAppIds: string[],
		cursorUpdatedAt: Date,
		cursorId: string | null,
		chunkSize: number,
	) => {
		let query = db.teamMembers
			.includeDeleted()
			.where({
				OR: [
					{ userId },
					...(userOwnerAdminTeamAppIds.length > 0 ? [{ teamAppId: { in: userOwnerAdminTeamAppIds } }] : [])
				]
			})
			.select("*")
			.order({ updatedAt: "ASC", teamMemberId: "ASC" })
			.limit(chunkSize);

		if (cursorId === null) {
			return await query.where({ updatedAt: { gte: cursorUpdatedAt } });
		} else {
			return await query.where({
				OR: [
					{ updatedAt: { gt: cursorUpdatedAt } },
					{ updatedAt: cursorUpdatedAt, teamMemberId: { gt: cursorId } },
				],
			});
		}
	};