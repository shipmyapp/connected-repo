import { db } from "@backend/db/db";

const getTeamMembersDelta = (
		userId: string,
		userOwnerAdminTeamAppIds: string[],
		cursorUpdatedAt: Date,
		cursorId: string | null,
		chunkSize: number,
	) => {
		const where: any = {
			OR: [{ userId }],
		};
		if (userOwnerAdminTeamAppIds.length > 0) {
			where.OR.push({ teamAppId: { in: userOwnerAdminTeamAppIds } });
		}

		let query = db.teamMembers
			.includeDeleted()
			.where(where)
			.select("*")
			.order({ updatedAt: "ASC", teamMemberId: "ASC" })
			.limit(chunkSize);

		if (cursorId === null) {
			return query.where({ updatedAt: { gte: cursorUpdatedAt } });
		} else {
			return query.where({
				OR: [
					{ updatedAt: { gt: cursorUpdatedAt } },
					{ updatedAt: cursorUpdatedAt, teamMemberId: { gt: cursorId } },
				],
			});
		}
	};