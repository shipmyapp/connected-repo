// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this layout, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeLayout } from "@backend/novu/code_layout";
import { appLayout } from "./app.layout";

// Every email layout ensureNovuWorkflows keeps in a Novu environment.
export const novuLayouts: CodeLayout[] = [
	appLayout,
];
