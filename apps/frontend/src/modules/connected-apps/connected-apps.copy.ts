/**
 * Connected apps (ADR-045): AI apps a person signed in to their own account.
 * The app's name comes from `useTenant().brand.appName`.
 */
export const CONNECTED_APPS_COPY = {
	// The consent screen.
	consentTitle: (platform: string, appName: string) =>
		`Connect ${platform} to your ${appName} account?`,
	consentReturnsTo: (host: string) => `After you connect, you go back to ${host}.`,
	consentUnverified: (name: string) =>
		`We could not confirm who made “${name}”. Connect it only if you started this from that app yourself.`,
	consentLead:
		"It will work on your account as you, with what you allow here. You can change this or disconnect it any time in your profile.",
	consentAllowTitle: "What it may do",
	consentAlways: "Always",
	scopeLabel: {
		read: "See your teams, their members, your journal entries and the prompts",
		write: "Add journal entries for you (it shows you each entry before saving it)",
	},
	consentNever: "It can never change your sign-in, manage your teams, or delete anything.",
	connect: "Connect",
	connecting: "Connecting…",
	cancel: "Cancel",
	consentError: "That did not work. Go back to the app and try connecting again.",
	consentLoadError:
		"This request is not valid any more. Go back to the app and try connecting again.",

	// The profile.
	section: "Connected apps",
	sectionInfo: "AI apps you signed in to your account. Each works as you, with what you allowed.",
	none: "No apps connected.",
	howToConnect: (appName: string) =>
		`To connect one, add ${appName} as a connector (a custom MCP server) in Claude, ChatGPT or another AI app, with this address:`,
	copyAddress: "Copy",
	addressCopied: "Address copied",
	lastUsed: (when: string) => `Last used ${when}`,
	neverUsed: "Not used yet",
	changes: (n: number) => (n === 1 ? "1 change in 30 days" : `${n} changes in 30 days`),
	recentTitle: "Latest changes",
	mayTitle: "It may",
	disconnect: "Disconnect",
	disconnecting: "Disconnecting…",
	disconnectTitle: (platform: string) => `Disconnect ${platform}?`,
	disconnectConfirm: "It stops working on your account at once.",
	disconnected: (platform: string) => `${platform} disconnected`,
	narrowed: "Saved. The app can no longer do that.",
	addBackHint: "To allow it again, connect the app again.",
	loadError: "Could not load your connected apps.",
	retry: "Retry",
	unverified: "not verified",
} as const;
