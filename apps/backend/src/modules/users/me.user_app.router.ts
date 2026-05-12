import { db } from "@backend/db/db";
import { rpcProtectedProcedure } from "@backend/procedures/protected.procedure";

const profile = rpcProtectedProcedure
    .handler(async ({ context: { user: { id: userId } } }) => {
        const profile = await db.users.select("*", {
            teams: (t) => t.teams.selectAll()
        }).find(userId);

        return profile;
    });

export const meRouter = {
    profile,
};