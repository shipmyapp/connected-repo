import { db } from "@backend/db/db";
import type { journalEntryCreatedFanoutTaskDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import { triggerNotification } from "@backend/utils/notifications.utils";
import type { Static } from "pg-tbus";

/**
 * Fan out `journal-entry-created` notifications to every teammate
 * except the author. Explicit iteration rather than a Novu Topic —
 * teams are small (<50 members) so per-subscriber trigger cost is
 * negligible, and we avoid the topic-membership bookkeeping on team
 * join/leave. If team sizes grow we can migrate to `to: { topicKey }`.
 *
 * Each `triggerNotification` failure is logged but does NOT throw —
 * one bad subscriber shouldn't take down the whole fan-out. The task
 * only re-throws if EVERY trigger failed (server-wide Novu outage) so
 * pg-tbus retries the whole batch.
 */
export const journalEntryCreatedFanoutHandler = async ({
	input,
}: {
	input: Static<typeof journalEntryCreatedFanoutTaskDef.schema>;
}) => {
	const { entryId, teamId, authorUserId, authorName, contentPreview } = input;

	const members = await db.$query<{ user_id: string }>`
		SELECT user_id FROM team_members
		WHERE team_id = ${teamId}::uuid
			AND user_id != ${authorUserId}::uuid
			AND deleted_at IS NULL
	`;
	const recipients = members.rows.map((r) => r.user_id);
	if (recipients.length === 0) return;

	let failures = 0;
	for (const subscriberId of recipients) {
		try {
			await triggerNotification({
				workflowId: "journal-entry-created",
				subscriberId,
				payload: { entryId, authorName, contentPreview },
			});
		} catch (err) {
			failures += 1;
			logger.warn(
				{ err, subscriberId, entryId },
				"[journalEntryCreatedFanout] per-subscriber trigger failed",
			);
		}
	}

	if (failures === recipients.length && recipients.length > 0) {
		// All triggers failed — throw so pg-tbus retries the whole batch.
		throw new Error(
			`[journalEntryCreatedFanout] all ${recipients.length} triggers failed for entry ${entryId}`,
		);
	}
};
