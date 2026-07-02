import { usePwaInstall } from "@frontend/hooks/usePwaInstall";
import type { PWAInstallElement } from "@khmyznikov/pwa-install";
import { createContext, type ReactNode, useContext } from "react";

/**
 * Shares the `usePwaInstall` state singleton across the tree — the
 * <pwa-install> web component is mounted exactly once (below), and any
 * component (banner, dialog, profile toggle) can call `usePwaInstallCtx()`
 * to read the same install-available / standalone / apple-mobile state
 * and trigger install() without remounting the element.
 */

type PwaInstallCtx = ReturnType<typeof usePwaInstall>;
const Ctx = createContext<PwaInstallCtx | null>(null);

interface PwaInstallHostProps {
	children: ReactNode;
	manifestUrl?: string;
	icon?: string;
}

export const PwaInstallHost = ({
	children,
	manifestUrl,
	icon,
}: PwaInstallHostProps) => {
	const state = usePwaInstall();

	return (
		<Ctx.Provider value={state}>
			{children}
			{/* Web component renders hidden — we drive the UX ourselves.
			    `disable-chrome` skips its built-in Chromium install dialog;
			    `manual-apple manual-chrome` gates the library's dialogs to
			    programmatic .install() calls. */}
			<pwa-install
				ref={state.ref as React.Ref<PWAInstallElement>}
				manifest-url={manifestUrl}
				icon={icon}
				disable-chrome="true"
				manual-apple="true"
				manual-chrome="true"
				use-local-storage="true"
				hidden
			/>
		</Ctx.Provider>
	);
};

export const usePwaInstallCtx = () => {
	const ctx = useContext(Ctx);
	if (!ctx) {
		throw new Error("usePwaInstallCtx must be used inside <PwaInstallHost>");
	}
	return ctx;
};
