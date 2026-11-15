/**
 * A Novu email layout as the code holds it: the frame (header, footer,
 * fonts) every email step that names it is drawn inside, its own body at
 * `{{content}}`. `updatedAt` works as on a workflow (code_workflow.ts): the
 * newer of the code and the dashboard wins at boot (ensureNovuWorkflows).
 */
export type CodeLayout = {
	updatedAt: string;
	definition: (input: { appUrl: string }) => {
		layoutId: string;
		name: string;
		isTranslationEnabled?: boolean;
		email: { body: string; editorType: "html" | "block" };
	};
};
