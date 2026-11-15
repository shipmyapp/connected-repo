import { useThemeMode } from "@connected-repo/ui-mui/theme/ThemeContext";
import type { ThemeSetting } from "@connected-repo/zod-schemas/enums.zod";
import { authClient } from "@frontend/utils/auth.client";
import { patchAuthCacheUser } from "@frontend/utils/auth.persistence";
import { useCallback } from "react";
import { toast } from "react-toastify";

/**
 * Applies a theme at once and saves it on the account (`users.theme_setting`),
 * so every device and the next sign-in agree; `AppLayout` seeds the theme
 * from that saved value. Written through better-auth (`updateUser`), which
 * refreshes its own session cookie, so the next loader run reads the new
 * value. The offline copy of the user is patched either way, or an offline
 * restart would put the previous theme back; when the save fails (offline),
 * the account keeps its old value until the next choice made online.
 */
export function useSaveThemeSetting() {
	const { setThemeMode } = useThemeMode();
	return useCallback(
		async (next: ThemeSetting) => {
			setThemeMode(next);
			patchAuthCacheUser({ themeSetting: next });
			try {
				// better-auth's client resolves `{ error }` on an HTTP failure and
				// throws only on a network failure: both mean "not saved".
				const { error } = await authClient.updateUser({ themeSetting: next });
				if (error) throw error;
			} catch {
				toast.error("Theme applied on this device, but it could not be saved to your account.");
			}
		},
		[setThemeMode],
	);
}
