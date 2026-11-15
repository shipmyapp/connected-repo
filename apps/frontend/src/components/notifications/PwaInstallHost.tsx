import { INSTALL_COPY } from "@frontend/components/pwa/install.copy";
import { PwaInstallSheet } from "@frontend/components/pwa/PwaInstallSheet";
import { type PwaInstallState, usePwaInstall } from "@frontend/hooks/usePwaInstall";
import { createContext, type ReactNode, useContext, useEffect, useRef } from "react";
import { type Id, toast } from "react-toastify";

/**
 * One install state for the tree: the profile's Install card, the push asks
 * and the install sheet all read it, and any of them can call `install()`.
 * The `<pwa-install>` element is no longer mounted here: `install-dialog.ts`
 * makes it lazily, only where it is offered.
 */
const Ctx = createContext<PwaInstallState | null>(null);

/**
 * While the browser installs (after Install in its dialog, until it reports
 * done), a toast with a spinner says so, wherever install was started from;
 * then it says where the app is now.
 */
const useInstallProgressToast = (isInstalling: boolean, isInstalled: boolean) => {
	const toastId = useRef<Id | null>(null);
	useEffect(() => {
		if (isInstalling) {
			if (toastId.current === null) toastId.current = toast.loading(INSTALL_COPY.installing);
			return;
		}
		const id = toastId.current;
		if (id === null) return;
		toastId.current = null;
		if (isInstalled) {
			toast.update(id, {
				render: INSTALL_COPY.installed,
				type: "success",
				isLoading: false,
				autoClose: 6000,
			});
		} else {
			toast.dismiss(id);
		}
	}, [isInstalling, isInstalled]);
};

export const PwaInstallHost = ({ children }: { children: ReactNode }) => {
	const state = usePwaInstall();
	useInstallProgressToast(state.isInstalling, state.isInstalled);
	return (
		<Ctx.Provider value={state}>
			{children}
			<PwaInstallSheet />
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
