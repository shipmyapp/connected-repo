import * as Comlink from "comlink";
import { CDNManager } from "./cdn/cdn.manager";
import { mediaUploadService } from "./cdn/media-upload.service";
import { setActiveTeamId } from "./sync/active_team";

const mediaWorkerApi = {
  cdn: Comlink.proxy(new CDNManager()),
  media: Comlink.proxy(mediaUploadService),
  // The media worker has its own realm and its own copy of `active_team.ts`,
  // so the header cache read by the orpc client (via `active_team_header.client.ts`
  // → `onActiveTeamChange`) starts empty here. Main thread seeds it on spawn
  // and on team switch. Without this, every CDN RPC out of the worker misses
  // `x-team-id` and the backend rejects with "Active team id mismatch."
  setActiveTeamId(id: string | null): void {
    setActiveTeamId(id);
  },
};

export type MediaWorkerAPI = typeof mediaWorkerApi;

Comlink.expose(mediaWorkerApi);
