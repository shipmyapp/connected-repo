/** The message the service worker sends an open window to show a screen (a notification tap), without a reload. */
export const NAVIGATE_MESSAGE = "app:navigate";

/** A path the service worker asks the open app to show: one of its own, never another site. */
export const isInAppPath = (path: unknown): path is string =>
	typeof path === "string" &&
	path.startsWith("/") &&
	!path.startsWith("//") &&
	!path.startsWith("/\\");
