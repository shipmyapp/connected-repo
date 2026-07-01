import type { userCreatedEventDef } from "@backend/events/events.schema";
import { logger } from "@backend/utils/logger.utils";
import {
	triggerNotification,
	upsertSubscriber,
} from "@backend/utils/notifications.utils";
import type { Static } from "pg-tbus";

export const userCreatedNotificationHandler = async (props: {
	input: Static<typeof userCreatedEventDef.schema>;
}) => {
	const { userId, name, email } = props.input;

	try {
		await upsertSubscriber(userId, { email, firstName: name });
		await triggerNotification({
			workflowId: "user-created",
			subscriberId: userId,
			payload: { name },
		});
	} catch (error) {
		logger.error(
			{ userId, error },
			"Error processing user.created notification",
		);
		// Re-throw so pg-tbus applies the task's retry policy.
		throw error;
	}
};
