import { notificationDispatchTaskDef } from "@backend/events/events.schema";
import { tbus } from "@backend/events/tbus";
import { logger } from "@backend/utils/logger.utils";
import { triggerNotification, upsertSubscriber } from "@backend/utils/notifications.utils";
import type { Static } from "pg-tbus";

export type NotificationRequest = Static<typeof notificationDispatchTaskDef.schema>;

/**
 * Queues one notification (pg-tbus `notification_dispatch`). Never throws:
 * a notification is a side effect, and losing one must not fail the request
 * that caused it; a queue that cannot be written is logged.
 */
export const queueNotification = async (
	request: NotificationRequest,
	options: { singletonKey?: string } = {},
): Promise<void> => {
	await tbus.send(notificationDispatchTaskDef.from(request, options)).catch((err: unknown) =>
		// workflowId only: the subscriber id of an invitee is `email:<address>`,
		// and every log line at info or above also becomes a Sentry breadcrumb.
		logger.error({ err, workflowId: request.workflowId }, "Notification not queued"),
	);
};

/** The `notification_dispatch` handler: subscriber first, then the workflow. Throws so pg-tbus retries. */
export const notificationDispatchHandler = async ({
	input,
}: {
	input: NotificationRequest;
}): Promise<void> => {
	const { workflowId, to, payload } = input;
	if (to.email) {
		await upsertSubscriber(to.subscriberId, { email: to.email, firstName: to.firstName ?? null });
	}
	await triggerNotification({ workflowId, subscriberId: to.subscriberId, payload });
};
