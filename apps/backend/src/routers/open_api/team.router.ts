import { openApiAuthProcedure } from "@backend/procedures/open_api_auth.procedure";
import { teamApiSelectAllZod } from "@connected-repo/zod-schemas/team_api.zod";

const getTeamInfo = openApiAuthProcedure
	.route({ method: "GET", tags: ["Team"] })
	.output(teamApiSelectAllZod)
	.handler(async ({ context }) => {
		return context.team;
	});

export const teamRouter = {
	info: getTeamInfo,
};