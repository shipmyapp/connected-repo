// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this workflow, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeWorkflow } from "@backend/novu/code_workflow";

export const journalEntryCreatedWorkflow: CodeWorkflow = {
	updatedAt: "2026-11-15T21:45:36.000Z",
	definition: () => ({
		workflowId: "journal-entry-created",
		name: "Journal Entry Created",
		description: "Notifies team members (excluding the author) when a new journal entry lands.",
		active: true,
		payloadSchema: {
			type: "object",
			properties: {
				entryId: {
					type: "string",
				},
				authorName: {
					type: "string",
				},
				contentPreview: {
					type: "string",
				},
			},
			required: [
				"entryId",
				"authorName",
			],
		},
		isTranslationEnabled: false,
		severity: "none",
		source: "dashboard",
		steps: [
			{
				stepId: "send-push",
				name: "Push",
				type: "push",
				controlValues: {
					subject: "{{payload.authorName | default: 'A teammate'}} added a journal entry",
					body: "{{payload.contentPreview | default: 'Tap to read.'}}",
				},
			},
			{
				stepId: "send-in-app",
				name: "In-app",
				type: "in_app",
				controlValues: {
					body: "{{payload.contentPreview | default: 'Tap to read.'}}",
					subject: "{{payload.authorName | default: 'A teammate'}} added a journal entry",
					redirect: {
						url: "/journal-entries/{{payload.entryId}}",
						target: "_self",
					},
					disableOutputSanitization: false,
				},
			},
		],
	}),
};
