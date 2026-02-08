import { BaseTable } from "@backend/db/base_table";
import type { Db } from "@backend/db/db";
import { userCreatedEventDef } from "@backend/events/events.schema";
import { orchidToTbusQueryAdapter } from "@backend/events/events.utils";
import { tbus } from "@backend/events/tbus";

export class UserTable extends BaseTable {
	readonly table = "users";

	columns = this.setColumns((t) => ({
		id: t.uuid().primaryKey().default(t.sql`gen_random_uuid()`),
		email: t.string().unique(),
		emailVerified: t.boolean().default(false),
		name: t.string(),
		image: t.string().nullable(),
		timezone: t.string().default("Etc/UTC"),
		themeSetting: t.themeSettingEnum(),
		journalReminderTimes: t.array(t.string()).default([]),
		...t.timestamps(),
	}));

	init() {
		this.afterCreate(["email", "id", "name"], async (users, queryCtx) => {
			// Publish the user.created event for each new user (with Orchid query context)
			await Promise.all(
				users.map(user => {
					const eventData = {
						userId: user.id,
						email: user.email,
						name: user.name
					};
					return tbus.publish(
						userCreatedEventDef.from(eventData),
						{ query: orchidToTbusQueryAdapter(queryCtx) }
					);
				})
			);
		})
	}
}