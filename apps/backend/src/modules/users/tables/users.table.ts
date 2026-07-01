import { BaseTable } from "@backend/db/base_table";
import { db } from "@backend/db/db";
import { userCreatedEventDef } from "@backend/events/events.schema";
import { orchidToTbusQueryAdapter } from "@backend/events/events.utils";
import { tbus } from "@backend/events/tbus";
import { TeamMemberTable } from "@backend/modules/teams/tables/team_members.table";
import { TeamAppTable } from "@backend/modules/teams/tables/teams_app.table";

export class UserTable extends BaseTable {
	readonly table = "users";

	columns = this.setColumns((t) => ({
		id: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
		email: t.string().unique().nullable(),
		emailVerified: t.boolean().default(false),
		phoneNumber: t.string().unique().nullable(),
		phoneNumberVerified: t.boolean().default(false),
		name: t.string(),
		image: t.string().nullable(),
		timezone: t.string().default("Etc/UTC"),
		themeSetting: t.themeSettingEnum(),
		journalReminderTimes: t.array(t.string()).default([]),
		activeTeamAppId: t
			.ulid()
			.foreignKey("teams_app", "id", {
				onDelete: "RESTRICT",
				onUpdate: "RESTRICT",
			})
			.nullable(),
		...t.timestampsAsNumbers(),
	}));

	relations = {
		teamMembers: this.hasMany(() => TeamMemberTable, {
			columns: ["id"],
			references: ["userId"],
		}),
		teams: this.hasMany(() => TeamAppTable, {
			through: "teamMembers",
			source: "team",
		}),
	};

	init() {
		// User creation goes through better-auth's adapter, so we can't
		// wrap the insert with a nested create. `afterCreate` is the
		// integration seam. It fires exactly once per insert — no need to
		// guard against re-runs or check whether a personal team already
		// exists.
		this.afterCreate(
			["email", "emailVerified", "id", "name", "phoneNumber"],
			async (users, queryCtx) => {
				await Promise.all(
					users.map(async (user) => {
						// 1. Claim any orphan memberships the user was invited to
						//    before they signed up.
						if (user.email) {
							await db.teamMembers
								.where({ email: user.email, userId: null })
								.update({
									userId: user.id,
									joinedAt: Date.now(),
								});
						}
						if (user.phoneNumber) {
							await db.teamMembers
								.where({ phoneNumber: user.phoneNumber, userId: null })
								.update({
									userId: user.id,
									joinedAt: Date.now(),
								});
						}

						// 2. Create the personal team + Owner membership. The team
						//    can never be deleted while the user exists; it
						//    cascades away with the user (FK onDelete CASCADE on
						//    personal_team_for_user_id). No existence check —
						//    the user was just inserted, so this is the first
						//    and only time a personal team is minted.
						const firstName = user.name.split(" ")[0] || "Personal";
						const personalTeam = await db.teamsApp.create({
							name: `${firstName}'s Team`,
							createdByUserId: user.id,
							personalTeamForUserId: user.id,
							members: {
								create: [
									{
										userId: user.id,
										email: user.email,
										phoneNumber: user.phoneNumber,
										role: "Owner",
										joinedAt: Date.now(),
									},
								],
							},
						});

						// 3. Stamp the personal team as active so the client is
						//    ready to sync on first login without any extra
						//    round-trip.
						await db.users
							.where({ id: user.id })
							.update({ activeTeamAppId: personalTeam.id });

						// 4. Publish the user.created event once the email is
						//    verified (marketing / onboarding webhook fan-out).
						if (user.email && user.emailVerified) {
							const eventData = {
								userId: user.id,
								email: user.email,
								name: user.name,
							};
							return tbus.publish(userCreatedEventDef.from(eventData), {
								query: orchidToTbusQueryAdapter(queryCtx),
							});
						}
					}),
				);
			},
		);
	}
}
