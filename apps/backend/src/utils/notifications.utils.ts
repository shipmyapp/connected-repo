import { novu } from "@backend/configs/novu.config";
import { logger } from "@backend/utils/logger.utils";

type SubscriberAttrs = {
	email?: string | null;
	phone?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	avatar?: string | null;
	locale?: string | null;
	data?: Record<string, unknown>;
};

/**
 * Upsert a Novu subscriber. Safe to call on every notification trigger —
 * Novu treats this as idempotent. No-op when NOVU_SECRET_KEY is unset.
 */
export const upsertSubscriber = async (
	subscriberId: string,
	attrs: SubscriberAttrs,
) => {
	if (!novu) return;
	await novu.subscribers.create({
		subscriberId,
		email: attrs.email ?? undefined,
		phone: attrs.phone ?? undefined,
		firstName: attrs.firstName ?? undefined,
		lastName: attrs.lastName ?? undefined,
		avatar: attrs.avatar ?? undefined,
		locale: attrs.locale ?? undefined,
		data: attrs.data,
	});
};

/**
 * Trigger a Novu workflow. Throws on failure so pg-tbus can retry.
 * No-op (returns without throwing) when NOVU_SECRET_KEY is unset.
 */
export const triggerNotification = async (params: {
	workflowId: string;
	subscriberId: string;
	payload?: Record<string, unknown>;
	overrides?: Record<string, unknown>;
}) => {
	if (!novu) return;
	const result = await novu.trigger({
		workflowId: params.workflowId,
		to: { subscriberId: params.subscriberId },
		payload: params.payload ?? {},
		overrides: params.overrides,
	});

	if (result.result?.status === "error") {
		logger.error(
			{
				workflowId: params.workflowId,
				subscriberId: params.subscriberId,
				result,
			},
			"Novu trigger returned error status",
		);
		throw new Error(`Novu trigger failed for workflow "${params.workflowId}"`);
	}
};
