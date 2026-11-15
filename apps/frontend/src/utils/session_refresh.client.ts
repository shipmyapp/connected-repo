/**
 * One-shot request for `authLoader` to bypass better-auth's session cookie
 * cache on its next run.
 *
 * ## Why this exists
 *
 * `auth.config.ts` enables `session.cookieCache` with a 5 minute `maxAge`, so
 * `authClient.getSession()` normally answers out of a signed cookie without
 * touching the database. Anything that mutates the `users` row *outside*
 * better-auth is therefore invisible to the client for up to five minutes.
 *
 * `teams.setActiveTeam` is exactly that: it writes `users.activeTeamAppId`
 * with a plain `db.users.update`. Revalidating the router straight after the
 * mutation re-ran `authLoader`, which read the stale cookie, handed back the
 * OLD `activeTeamAppId` and re-seeded the `x-team-id` header cache with it —
 * so the switch silently reverted and nothing threw. That is what "clicking
 * a team on the profile page does nothing" was.
 *
 * The flag is one-shot on purpose. Bypassing the cache on every navigation
 * would put a database round-trip in front of every protected route; we only
 * need it on the single load that follows a write the cookie cannot know about.
 */

let bypassCookieCacheOnce = false;

/**
 * Call immediately before `revalidator.revalidate()` after mutating a user
 * field that better-auth does not write itself (today: `activeTeamAppId`).
 */
export const requestFreshSession = (): void => {
	bypassCookieCacheOnce = true;
};

/** Reads and clears the flag. Only `authLoader` should call this. */
export const consumeFreshSessionRequest = (): boolean => {
	const requested = bypassCookieCacheOnce;
	bypassCookieCacheOnce = false;
	return requested;
};
