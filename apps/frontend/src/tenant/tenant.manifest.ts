/**
 * Points the page at one web app manifest. The PWA plugin writes the page's
 * only `<link rel="manifest">` into the built `index.html` (and into the dev
 * page when its dev mode is on); a team's own host points that link at the
 * team's manifest. Exactly one link is left: a second one would leave the
 * browser free to read the shared app's manifest on a team's host. When the
 * page has none (the dev server without the plugin's dev mode), one is added.
 */
export function linkManifest(href: string, doc: Document = document): void {
	const [first, ...extra] = doc.querySelectorAll<HTMLLinkElement>('link[rel~="manifest"]');
	for (const link of extra) link.remove();
	const link =
		first ??
		(() => {
			const created = doc.createElement("link");
			created.rel = "manifest";
			doc.head.appendChild(created);
			return created;
		})();
	link.href = href;
}
