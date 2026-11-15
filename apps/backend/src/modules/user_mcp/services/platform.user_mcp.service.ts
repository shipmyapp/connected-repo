/**
 * Which platform a connected app is (ADR-045). An app registers itself and
 * names itself, so its name proves nothing; where its sign-in returns to
 * (the redirect URI's host, checked on every sign-in) does. Known hosts map
 * to a platform; anything else shows the app's own name, marked unverified.
 */
const KNOWN_HOSTS: ReadonlyArray<{ host: RegExp; platform: string }> = [
	{ host: /^(claude\.ai|claude\.com)$/, platform: "Claude" },
	{
		host: /^(chatgpt\.com|chat\.openai\.com|platform\.openai\.com)$/,
		platform: "ChatGPT",
	},
	{ host: /^gemini\.google\.com$/, platform: "Gemini" },
	{ host: /^(copilot\.microsoft\.com|github\.com)$/, platform: "Copilot" },
	{ host: /^(www\.)?perplexity\.ai$/, platform: "Perplexity" },
	{ host: /^(cursor\.com|cursor\.sh)$/, platform: "Cursor" },
	{ host: /^(vscode\.dev|insiders\.vscode\.dev)$/, platform: "VS Code" },
	{ host: /^((www\.)?mistral\.ai|chat\.mistral\.ai)$/, platform: "Le Chat" },
];

/** Custom URL schemes desktop apps sign in back to. */
const KNOWN_SCHEMES: Record<string, string> = {
	"cursor:": "Cursor",
	"vscode:": "VS Code",
	"vscode-insiders:": "VS Code",
	"claude:": "Claude",
	"windsurf:": "Windsurf",
};

const LOOPBACK = /^(localhost|127\.0\.0\.1|\[::1\])$/;

interface PlatformInfo {
	platform: string;
	isKnownPlatform: boolean;
	host: string;
}

const cleanName = (name: string | null | undefined): string | null => {
	const printable = [...(name ?? "")].filter((char) => char >= " ").join("");
	const trimmed = printable.trim().slice(0, 40);
	return trimmed ? trimmed : null;
};

export const platformOf = (
	client: { name: string | null; redirectUris: string[] },
	redirectUri?: string,
): PlatformInfo => {
	const uri = redirectUri ?? client.redirectUris[0] ?? "";
	let url: URL | null = null;
	try {
		url = new URL(uri);
	} catch {
		url = null;
	}
	const name = cleanName(client.name);
	if (!url)
		return {
			platform: name ?? "An app",
			isKnownPlatform: false,
			host: uri.slice(0, 80),
		};
	const scheme = KNOWN_SCHEMES[url.protocol];
	if (scheme)
		return {
			platform: scheme,
			isKnownPlatform: true,
			host: url.protocol.replace(/:$/, ""),
		};
	const host = url.hostname.toLowerCase();
	const known = KNOWN_HOSTS.find((entry) => entry.host.test(host));
	if (known && url.protocol === "https:")
		return { platform: known.platform, isKnownPlatform: true, host };
	if (LOOPBACK.test(host)) {
		// A desktop or command-line app on the person's own computer (Claude Code, Claude Desktop…).
		return {
			platform: name ?? "An app on this computer",
			isKnownPlatform: false,
			host: "this computer",
		};
	}
	return { platform: name ?? host, isKnownPlatform: false, host };
};
