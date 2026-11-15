/**
 * Connecting an AI app (ADR-045): the app sends the person to
 * the API's `/oauth2/authorize`, which sends a signed-out person to the
 * sign-in page with the request in the address (signed, with `exp` and
 * `sig`). Sign-in is by Google or Apple with a full-page redirect, so the
 * login page sets the social `callbackURL` to the authorize URL; the request
 * is also remembered for this tab and taken once the person is signed in.
 */
const STORAGE_KEY = "oauth.pending-authorize";

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const tabStorage = (): StorageLike | null => {
	try {
		return globalThis.sessionStorage ?? null;
	} catch {
		return null;
	}
};

/** The parameters an authorize request must carry to be worth resuming. */
const REQUIRED = ["client_id", "redirect_uri", "response_type"] as const;

/** Whether an address's query is an OAuth authorize request handed over for sign-in. */
export const isOAuthRequest = (params: URLSearchParams): boolean =>
	REQUIRED.every((key) => params.has(key)) && params.has("sig");

/**
 * The authorize query without the signature the server added for the
 * sign-in page, and without a `prompt` that asks for the sign-in just done
 * (`login`, `create`), which would send the person round again.
 */
export const authorizeQueryOf = (params: URLSearchParams): string => {
	const query = new URLSearchParams(params);
	query.delete("sig");
	query.delete("exp");
	const prompt = (query.get("prompt") ?? "")
		.split(" ")
		.filter((value) => value && value !== "login" && value !== "create");
	if (prompt.length > 0) query.set("prompt", prompt.join(" "));
	else query.delete("prompt");
	return query.toString();
};

export const rememberOAuth = (
	params: URLSearchParams,
	now = Date.now(),
	storage: StorageLike | null = tabStorage(),
): void => {
	if (!isOAuthRequest(params) || !storage) return;
	const exp = Number(params.get("exp") ?? 0) * 1000;
	if (exp && exp < now) return;
	try {
		storage.setItem(
			STORAGE_KEY,
			JSON.stringify({ query: authorizeQueryOf(params), until: exp || now + 10 * 60 * 1000 }),
		);
	} catch {
		// Storage can be unavailable (private mode, embedded views).
	}
};

/** The remembered request as an authorize query, left in place; null when none or too old. */
export const peekPendingOAuth = (
	now = Date.now(),
	storage: StorageLike | null = tabStorage(),
): string | null => {
	try {
		const raw = storage?.getItem(STORAGE_KEY);
		if (!raw) return null;
		const value: unknown = JSON.parse(raw);
		if (typeof value !== "object" || value === null) return null;
		const query = "query" in value && typeof value.query === "string" ? value.query : null;
		const until = "until" in value && typeof value.until === "number" ? value.until : 0;
		if (!query || until < now) return null;
		return isOAuthRequest(new URLSearchParams(`${query}&sig=_`)) ? query : null;
	} catch {
		return null;
	}
};

/** The remembered request, removed as it is read. */
export const takePendingOAuth = (
	now = Date.now(),
	storage: StorageLike | null = tabStorage(),
): string | null => {
	const query = peekPendingOAuth(now, storage);
	try {
		storage?.removeItem(STORAGE_KEY);
	} catch {
		// Nothing to clear.
	}
	return query;
};

/** The authorize query to resume after sign-in: the one in the address, else the remembered one. */
export const oauthResumeQuery = (
	params: URLSearchParams,
	now = Date.now(),
	storage: StorageLike | null = tabStorage(),
): string | null =>
	isOAuthRequest(params) ? authorizeQueryOf(params) : peekPendingOAuth(now, storage);

/** Where the browser goes to carry on: the API's authorize endpoint. */
export const authorizeUrl = (apiBase: string, query: string): string =>
	`${apiBase.replace(/\/+$/, "")}/api/auth/oauth2/authorize?${query}`;
