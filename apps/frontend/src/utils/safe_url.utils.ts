/** True only for an absolute http(s) URL: never javascript:, data:, blob: or a relative path. */
export const isHttpUrl = (url: string): boolean => {
	try {
		const { protocol } = new URL(url);
		return protocol === "https:" || protocol === "http:";
	} catch {
		return false;
	}
};

/** Opens a stored URL in a new tab without giving that tab a handle on this one. */
export const openExternalUrl = (url: string): void => {
	if (!isHttpUrl(url)) return;
	window.open(url, "_blank", "noopener,noreferrer");
};
