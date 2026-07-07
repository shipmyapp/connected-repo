import * as Comlink from "comlink";
import { mediaUploadService } from "./cdn/media-upload.service";
import { setActiveTeamId } from "./sync/active_team";

/**
 * MediaWorker: stateless off-main-thread work.
 *
 * Currently only exposes thumbnail generation — the CDN upload path was
 * consolidated into `worker/sync/file_upload.worker.ts` (DataWorker
 * realm) so raw blobs no longer cross a Comlink boundary just to be
 * PUT-ed. This worker still carries its own copy of `active_team.ts`
 * because `getMediaProxy` seeds the `x-team-id` header cache on spawn
 * and on team switch; that seed is retained for any future MediaWorker
 * RPCs (there are none today) and to keep the spawn contract stable.
 */
const mediaWorkerApi = {
	media: Comlink.proxy(mediaUploadService),
	setActiveTeamId(id: string | null): void {
		setActiveTeamId(id);
	},
};

export type MediaWorkerAPI = typeof mediaWorkerApi;

// Default endpoint — used by main-thread callers (SmartMediaUploader,
// sync-triggers' active-team seed).
Comlink.expose(mediaWorkerApi);

// Direct DataWorker endpoint. The main thread brokers a MessageChannel once at
// startup and posts one port here; we expose the same API over it so the
// DataWorker's FileUploadWorker can call `generateThumbnail` WITHOUT hopping
// through the main thread. Comlink's default listener ignores this message
// (it isn't a Comlink protocol message), so the two coexist.
self.addEventListener("message", (event: MessageEvent) => {
	const port = (event.data as { __connectMediaPort?: MessagePort } | null)
		?.__connectMediaPort;
	if (port) Comlink.expose(mediaWorkerApi, port);
});
