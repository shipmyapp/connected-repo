/**
 * CSRF protection may be skipped only for a request a browser cannot have
 * sent by itself: it carries a bearer token and no cookie. With a cookie,
 * the browser attached the session on its own, so the CSRF header is
 * required as for any cookie request.
 */
export const isBearerOnlyRequest = (headers: Headers | undefined): boolean => {
	const authorization = headers?.get("authorization")?.trim();
	return Boolean(authorization && /^bearer\s+\S/i.test(authorization) && !headers?.has("cookie"));
};
