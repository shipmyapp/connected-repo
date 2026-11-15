// Generates every raster icon the PWA, browsers and Apple need from one source:
// public/icon.svg when a project adds one, else public/android-chrome-512x512.png.
// Run `yarn generate:icons` after changing the source and commit the outputs;
// the build never runs this. `--missing-only` writes only files not there yet.
//
// Outputs (all in public/):
//   favicon-16x16.png, favicon-32x32.png, apple-touch-icon.png (180),
//   android-chrome-192x192.png, android-chrome-512x512.png       "any" icons
//   maskable-icon-512x512.png   full-bleed square, art inside the 80% safe zone
//   badge-96x96.png             white silhouette on transparent (Android notification badge)
//   favicon.ico                 PNG-encoded 16/32/48
import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const publicDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../public");
const svgPath = path.join(publicDir, "icon.svg");
const pngPath = path.join(publicDir, "android-chrome-512x512.png");
const isSvg = existsSync(svgPath);
const source = await readFile(isSvg ? svgPath : pngPath);
const onlyMissing = process.argv.includes("--missing-only");
/** The manifest's background_color (vite.config.ts): the maskable icon's bleed. */
const MASKABLE_BACKGROUND = "#ffffff";

const transparent = { r: 0, g: 0, b: 0, alpha: 0 };
const png = (size) =>
	sharp(source, isSvg ? { density: 384 } : {})
		.resize(size, size, { fit: "contain", background: transparent })
		.png({ compressionLevel: 9 })
		.toBuffer();

const write = async (name, make) => {
	const file = path.join(publicDir, name);
	// Never overwrite the source itself.
	if (file === pngPath && !isSvg) return;
	if (onlyMissing && existsSync(file)) return;
	await writeFile(file, await make());
	console.info(`wrote public/${name}`);
};

for (const [name, size] of [
	["favicon-16x16.png", 16],
	["favicon-32x32.png", 32],
	["apple-touch-icon.png", 180],
	["android-chrome-192x192.png", 192],
	["android-chrome-512x512.png", 512],
]) {
	await write(name, () => png(size));
}

// The maskable icon fills the whole square (the OS applies its own mask) and
// keeps the artwork inside the 80% safe zone.
await write("maskable-icon-512x512.png", async () => {
	const inner = await png(Math.round(512 * 0.8));
	return sharp({ create: { width: 512, height: 512, channels: 4, background: MASKABLE_BACKGROUND } })
		.composite([{ input: inner, gravity: "centre" }])
		.png({ compressionLevel: 9 })
		.toBuffer();
});

// The notification badge: Android draws it as a mask, so only its alpha counts.
// The source's silhouette in white on transparent, with a little padding.
await write("badge-96x96.png", async () => {
	const art = await sharp(await png(80))
		.extend({ top: 8, bottom: 8, left: 8, right: 8, background: transparent })
		.ensureAlpha()
		.extractChannel("alpha")
		.raw()
		.toBuffer({ resolveWithObject: true });
	return sharp({ create: { width: 96, height: 96, channels: 3, background: "#ffffff" } })
		.joinChannel(art.data, { raw: { width: art.info.width, height: art.info.height, channels: 1 } })
		.png({ compressionLevel: 9 })
		.toBuffer();
});

// favicon.ico: an ICO container holding PNG-encoded 16, 32 and 48 px images.
await write("favicon.ico", async () => {
	const icoSizes = [16, 32, 48];
	const icoImages = await Promise.all(icoSizes.map((size) => png(size)));
	const header = Buffer.alloc(6);
	header.writeUInt16LE(0, 0);
	header.writeUInt16LE(1, 2);
	header.writeUInt16LE(icoImages.length, 4);
	const entries = Buffer.alloc(16 * icoImages.length);
	let offset = header.length + entries.length;
	icoImages.forEach((image, index) => {
		const size = icoSizes[index];
		const entry = index * 16;
		entries.writeUInt8(size, entry);
		entries.writeUInt8(size, entry + 1);
		entries.writeUInt8(0, entry + 2);
		entries.writeUInt8(0, entry + 3);
		entries.writeUInt16LE(1, entry + 4);
		entries.writeUInt16LE(32, entry + 6);
		entries.writeUInt32LE(image.length, entry + 8);
		entries.writeUInt32LE(offset, entry + 12);
		offset += image.length;
	});
	return Buffer.concat([header, entries, ...icoImages]);
});
