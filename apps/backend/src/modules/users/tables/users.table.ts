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
		defaultTeamAppId: t.ulid().foreignKey("teams_app", "id", {
			onDelete: "RESTRICT",
			onUpdate: "RESTRICT",
		}).nullable(),
		...t.timestamps(),
	}));

	relations = {
		teamMembers: this.hasMany(() => TeamMemberTable, {
			columns: ["id"],
			references: ["userId"],
		}),
		teams: this.hasMany(() => TeamAppTable, {
			through: "teamMembers",
			source: "team"
		}),
	}

	init() {
		this.afterCreate(["email", "emailVerified", "id", "name", "phoneNumber"], async (users, queryCtx) => {
			// Publish the user.created event for each new user (with Orchid query context)
			await Promise.all(
				users.map(async (user) => {
					// 1. Claim any memberships added by email but without userId
					if (user.email) {
						await db.teamMembers
							.where({ email: user.email, userId: null })
							.update({
								userId: user.id,
								joinedAt: Date.now(),
							});
					}

					// 2. Claim any memberships added by phoneNumber but without userId
					if (user.phoneNumber) {
						await db.teamMembers
							.where({ phoneNumber: user.phoneNumber, userId: null })
							.update({
								userId: user.id,
								joinedAt: Date.now(),
							});
					}

					if (user.email && user.emailVerified){
						// 3. Publish event
						const eventData = {
							userId: user.id,
							email: user.email,
							name: user.name,
						};
						return tbus.publish(
							userCreatedEventDef.from(eventData),
							{ query: orchidToTbusQueryAdapter(queryCtx) }
						);
					}
				})
			);
		});
	}

}