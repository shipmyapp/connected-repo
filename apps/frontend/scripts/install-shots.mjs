/**
 * The install pictures: each one a line of what the app does for the person,
 * over the app's screen in a device. They are the manifest's `screenshots`
 * (packages/zod-schemas/src/install_pictures.ts: same names), which the
 * install dialog's gallery, Chrome's richer install dialog and the app's own
 * install sheet show: narrow for phones, wide for tablets and computers.
 *
 *   node scripts/install-shots.mjs <screensDir> [outDir]   real screens, named as SHOTS[].screen
 *   node scripts/install-shots.mjs --placeholder [outDir]  no screens: a device frame with the app icon
 *   CHROMIUM_PATH=/path/to/chromium node scripts/install-shots.mjs …
 *
 * Take the screens from the running app (e.g. Playwright at 390x844 @3x for
 * phones, 1440x900 for the computer) on demo data. Each picture is drawn as a
 * page in headless Chromium at its exact size and written as WebP (quality
 * 82) by the browser's own encoder. Keep NARROW and WIDE at one size each:
 * Chrome shows a form factor's pictures only when they share an aspect ratio.
 * Edit SHOTS (and install_pictures.ts labels) with the product's own words.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const isPlaceholder = args[0] === "--placeholder";
const screensDir = isPlaceholder ? null : args[0];
const outArg = isPlaceholder ? args[1] : args[1];
if (!isPlaceholder && !screensDir) {
	console.error("usage: node scripts/install-shots.mjs <screensDir>|--placeholder [outDir]");
	process.exit(1);
}
const outDir = path.resolve(outArg ?? path.join(here, "../public/screenshots/install"));
const iconFile = path.join(here, "../public/android-chrome-512x512.png");

const NARROW = { width: 1080, height: 1920 };
const WIDE = { width: 1920, height: 1080 };
/** The theme's primary colour (vite.config.ts theme_color). */
const ACCENT = "#1976d2";

const SHOTS = [
	{ name: "phone-1-journal", screen: "phone-journal.webp", device: "phone", eyebrow: "Journal", title: "Write today's entry", accent: "in seconds.", line: "A prompt to start you off, photos if you like." },
	{ name: "phone-2-offline", screen: "phone-offline.webp", device: "phone", eyebrow: "Offline", title: "No connection?", accent: "Keep writing.", line: "Entries and photos wait on your phone and sync when you are back online." },
	{ name: "phone-3-reminders", screen: "phone-reminders.webp", device: "phone", eyebrow: "Reminders", title: "A gentle nudge,", accent: "when you want it.", line: "Pick the times; the app reminds you." },
	{ name: "wide-1-computer", screen: "desktop-journal.webp", device: "computer", eyebrow: "Everywhere", title: "Your journal", accent: "on a big screen.", line: "The same entries on every device you sign in on." },
];

const css = `
* { box-sizing: border-box; margin: 0; }
html, body { width: 100%; height: 100%; }
body { overflow: hidden; font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; color: #16191d;
	background: linear-gradient(165deg, #e8f1fb 0%, #ffffff 70%); }
.eyebrow { font-weight: 600; letter-spacing: 0.08em; text-transform: uppercase; color: ${ACCENT}; }
h1 { font-family: ui-serif, Georgia, "Times New Roman", serif; font-weight: 400; line-height: 1.04; letter-spacing: -0.01em; }
h1 .accent { display: block; color: ${ACCENT}; font-style: italic; }
.line { color: #5f6672; line-height: 1.35; }
.shot { display: block; width: 100%; height: auto; }
.placeholder { display: grid; place-items: center; background: #f3f6fa; }
.placeholder img { width: 30%; height: auto; opacity: 0.9; }
.phone { position: absolute; padding: 18px; border-radius: 96px; background: #0f1115;
	box-shadow: 0 50px 90px rgba(15, 17, 21, 0.28), 0 10px 24px rgba(15, 17, 21, 0.18); }
.phone .shot { border-radius: 80px; }
.phone .placeholder { height: 1700px; border-radius: 80px; }
.computer { position: absolute; border-radius: 18px; overflow: hidden; background: #fff;
	box-shadow: 0 50px 90px rgba(15, 17, 21, 0.28), 0 0 0 1px rgba(15, 17, 21, 0.08); }
.computer .bar { height: 38px; display: flex; align-items: center; gap: 10px; padding: 0 18px; background: #eceef1; }
.computer .bar i { width: 13px; height: 13px; border-radius: 50%; background: #c9ced6; }
.computer .placeholder { height: 700px; }
.narrow .copy { position: absolute; left: 88px; right: 88px; top: 96px; }
.narrow .eyebrow { font-size: 30px; margin-bottom: 26px; }
.narrow h1 { font-size: 100px; }
.narrow .line { font-size: 38px; margin-top: 30px; max-width: 860px; }
.narrow .phone { width: 840px; left: 120px; top: 590px; }
.wide .copy { position: absolute; left: 110px; top: 50%; transform: translateY(-50%); width: 600px; }
.wide .eyebrow { font-size: 24px; margin-bottom: 22px; }
.wide h1 { font-size: 92px; }
.wide .line { font-size: 32px; margin-top: 28px; }
.wide .computer { width: 1180px; left: 700px; top: 150px; }
`;

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

const screenOf = (shot) => {
	if (isPlaceholder) {
		const icon = fs.readFileSync(iconFile).toString("base64");
		return `<div class="placeholder"><img src="data:image/png;base64,${icon}" alt=""></div>`;
	}
	const screen = fs.readFileSync(path.join(screensDir, shot.screen));
	return `<img class="shot" src="data:image/webp;base64,${screen.toString("base64")}" alt="">`;
};

const device = (shot) => {
	const inner = screenOf(shot);
	if (shot.device === "computer") return `<div class="computer"><div class="bar"><i></i><i></i><i></i></div>${inner}</div>`;
	return `<div class="${shot.device}">${inner}</div>`;
};

const pageFor = (shot) => `<!doctype html><html><head><meta charset="utf-8"><style>${css}</style></head>
<body class="${shot.device === "phone" ? "narrow" : "wide"}">
	<div class="copy">
		<p class="eyebrow">${escapeHtml(shot.eyebrow)}</p>
		<h1>${escapeHtml(shot.title)} <span class="accent">${escapeHtml(shot.accent)}</span></h1>
		<p class="line">${escapeHtml(shot.line)}</p>
	</div>
	${device(shot)}
</body></html>`;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const written = [];
for (const shot of SHOTS) {
	const size = shot.device === "phone" ? NARROW : WIDE;
	const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 });
	await page.setContent(pageFor(shot), { waitUntil: "load" });
	await page.evaluate(() => document.fonts.ready);
	const png = await page.screenshot({ type: "png" });
	await page.close();
	// WebP through the browser's own encoder: no image library needed.
	const encoder = await browser.newPage();
	const out = await encoder.evaluate(
		async ({ data, width, height }) => {
			const img = new Image();
			img.src = `data:image/png;base64,${data}`;
			await img.decode();
			const canvas = new OffscreenCanvas(width, height);
			canvas.getContext("2d").drawImage(img, 0, 0);
			const blob = await canvas.convertToBlob({ type: "image/webp", quality: 0.82 });
			const bytes = new Uint8Array(await blob.arrayBuffer());
			let binary = "";
			for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
			return btoa(binary);
		},
		{ data: png.toString("base64"), ...size },
	);
	await encoder.close();
	const webp = Buffer.from(out, "base64");
	const file = path.join(outDir, `${shot.name}.webp`);
	fs.writeFileSync(file, webp);
	written.push({ file: path.relative(process.cwd(), file), bytes: webp.length });
}
await browser.close();
console.table(written);
