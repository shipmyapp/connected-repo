import { createHmac, timingSafeEqual } from "node:crypto";
import { env } from "@backend/configs/env.config";

/**
 * The preview-then-confirm step for changes a connected app makes
 * (ADR-045): the preview tool returns what will happen and a
 * confirmation code bound to exactly those arguments, this person and this
 * app, valid for ten minutes. The doing tool refuses without the code, or
 * with one made for different arguments, so the app cannot show the person
 * one thing and do another.
 */
const CONFIRMATION_TTL_MS = 10 * 60 * 1000;

const canonical = (value: unknown): string => {
	if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
	if (value && typeof value === "object") {
		return `{${Object.entries(value)
			.filter(([, inner]) => inner !== undefined)
			.sort(([a], [b]) => (a < b ? -1 : 1))
			.map(([key, inner]) => `${JSON.stringify(key)}:${canonical(inner)}`)
			.join(",")}}`;
	}
	return JSON.stringify(value);
};

const sign = (payload: string): string =>
	createHmac("sha256", `${env.BETTER_AUTH_SECRET}:connected-app-confirmation`)
		.update(payload)
		.digest("base64url");

interface Binding {
	action: string;
	userId: string;
	clientId: string;
	args: unknown;
}

export const confirmationFor = (binding: Binding, now = Date.now()): string => {
	const expiresAt = now + CONFIRMATION_TTL_MS;
	const signature = sign(`${expiresAt}.${canonical(binding)}`);
	return `${expiresAt.toString(36)}.${signature}`;
};

export const isConfirmationValid = (code: string, binding: Binding, now = Date.now()): boolean => {
	const [expiresPart, signature] = code.split(".");
	if (!expiresPart || !signature) return false;
	const expiresAt = Number.parseInt(expiresPart, 36);
	if (!Number.isFinite(expiresAt) || expiresAt < now) return false;
	const expected = Buffer.from(sign(`${expiresAt}.${canonical(binding)}`));
	const presented = Buffer.from(signature);
	return expected.length === presented.length && timingSafeEqual(expected, presented);
};
