import {
	currentInstallGuide,
	getInstallSnapshot,
	type InstallGuide,
	requestInstall,
	setInstallGuideOpen,
	subscribeInstall,
} from "@frontend/utils/install-prompt";
import { useSyncExternalStore } from "react";

export type PwaInstallState = {
	/** Running as the installed app. */
	isStandalone: boolean;
	/** Installed here, whether or not this page runs inside it. */
	isInstalled: boolean;
	/** Install can be offered here at all, by dialog or by guide. */
	canInstall: boolean;
	guide: InstallGuide;
	isGuideOpen: boolean;
	/** Accepted in the browser's dialog, not finished installing yet. */
	isInstalling: boolean;
	closeGuide: () => void;
	/** The native dialog where there is one, the steps for this browser otherwise. */
	install: () => Promise<void>;
};

export const usePwaInstall = (): PwaInstallState => {
	const snapshot = useSyncExternalStore(subscribeInstall, getInstallSnapshot, getInstallSnapshot);
	const guide = currentInstallGuide();
	return {
		isStandalone: snapshot.isStandalone,
		isInstalled: snapshot.isInstalled,
		canInstall: guide !== "NONE",
		guide,
		isGuideOpen: snapshot.isGuideOpen,
		isInstalling: snapshot.isInstalling,
		closeGuide: () => setInstallGuideOpen(false),
		install: async () => {
			await requestInstall();
		},
	};
};
