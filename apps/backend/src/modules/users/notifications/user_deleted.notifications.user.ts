import { novu } from "@backend/configs/novu.config";
import type { userDeletedEventDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import type { Static } from "pg-tbus";

/**
 * Delete the Novu subscriber when a user is removed. CASCADE handles the
 * push_devices rows on our side, but Novu doesn't know the user is gone —
 * without this the subscriber sits with orphan FCM credentials forever.
 *
 * No-op when Novu isn't configured (dev/CI without NOVU_SECRET_KEY).
 * Retried by pg-tbus on transient failures; a persistent 404 from Novu
 * (subscriber never existed) is swallowed so we don't retry forever.
 */
export const userDeletedNotificationHandler = async (props: {
	input: Static<typeof userDeletedEventDef.schema>;
}) => {
	const { userId } = props.input;
	if (!novu) return;

	try {
		await novu.subscribers.delete(userId);
	} catch (error) {
		const status = (error as { statusCode?: number })?.statusCode;
		if (status === 404) {
			logger.info({ userId }, "Novu subscriber already absent; treating as deleted");
			return;
		}
		logger.error({ userId, error }, "Error deleting Novu subscriber for removed user");
		throw error;
	}
};
