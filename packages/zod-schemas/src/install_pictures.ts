/**
 * The install pictures: what the app does for the person, a line of words over
 * an app screen in a device, drawn by `apps/frontend/scripts/install-shots.mjs`
 * into `apps/frontend/public/screenshots/install/`. One list for the static
 * manifest's `screenshots` (vite.config.ts), a team's manifest on its own host
 * (team hosts), the install dialog's gallery and the app's own sheet.
 *
 * Narrow pictures are for phones, wide ones for tablets and computers. Keep each
 * form factor at ONE size: Chrome shows a form factor's pictures only when they
 * share an aspect ratio. `src` is absolute so a manifest served from another
 * path (/api/tenant/manifest.webmanifest) points at the same files. WebP, so the
 * service worker's precache (png/svg/…) never picks them up.
 */
export type InstallPicture = {
	src: string;
	sizes: "1080x1920" | "1920x1080";
	type: "image/webp";
	form_factor: "narrow" | "wide";
	label: string;
};

const narrow = (name: string, label: string): InstallPicture => ({
	src: `/screenshots/install/${name}.webp`,
	sizes: "1080x1920",
	type: "image/webp",
	form_factor: "narrow",
	label,
});

const wide = (name: string, label: string): InstallPicture => ({
	src: `/screenshots/install/${name}.webp`,
	sizes: "1920x1080",
	type: "image/webp",
	form_factor: "wide",
	label,
});

/** In gallery order; the first is the one most people see. Names must match SHOTS in install-shots.mjs. */
export const INSTALL_PICTURES: readonly InstallPicture[] = [
	narrow("phone-1-journal", "Write today's entry in seconds, with a prompt to start you off"),
	narrow(
		"phone-2-offline",
		"Works offline: your entries and photos wait on your phone until you are back online",
	),
	narrow("phone-3-reminders", "A gentle reminder at the times you choose"),
	wide("wide-1-computer", "Your journal on a big screen, the same entries on every device"),
];
