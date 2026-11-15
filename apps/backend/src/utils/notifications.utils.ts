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
export const upsertSubscriber = async (subscriberId: string, attrs: SubscriberAttrs) => {
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
 * The payload without empty strings and nulls, at any depth. Novu's Liquid
 * check refuses `blank`, and in Liquid "" is true, so a template tests an
 * optional field with a plain `{% if payload.x %}`, which needs the field
 * absent when there is nothing in it.
 */
const compactPayload = (value: Record<string, unknown>): Record<string, unknown> =>
	Object.fromEntries(
		Object.entries(value).flatMap(([key, v]) => {
			if (v === "" || v === null || v === undefined) return [];
			return [[key, isRecord(v) ? compactPayload(v) : v]];
		}),
	);

const isRecord = (v: unknown): v is Record<string, unknown> =>
	typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The Novu subscriber for an address with no account yet (an invitee):
 * one per address, so a later account does not merge with it.
 */
export const emailSubscriberId = (email: string) => `email:${email.trim().toLowerCase()}`;

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
		payload: compactPayload(params.payload ?? {}),
		overrides: params.overrides,
	});

	if (result.result?.status === "error") {
		// An invitee's subscriber id is their address (`emailSubscriberId`):
		// keep it out of the log, which also feeds error tracking.
		logger.error(
			{
				workflowId: params.workflowId,
				subscriberId: params.subscriberId.startsWith("email:") ? "email:…" : params.subscriberId,
				transactionId: result.result?.transactionId,
				error: result.result?.error,
			},
			"Novu trigger returned error status",
		);
		throw new Error(`Novu trigger failed for workflow "${params.workflowId}"`);
	}
};
