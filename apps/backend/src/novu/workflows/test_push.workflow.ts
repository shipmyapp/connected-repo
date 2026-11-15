// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this workflow, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeWorkflow } from "@backend/novu/code_workflow";

export const testPushWorkflow: CodeWorkflow = {
	updatedAt: "2026-11-15T21:45:36.000Z",
	definition: () => ({
		workflowId: "test-push",
		name: "Test push",
		description: "Super-admin check that push and the Inbox are wired.",
		active: true,
		payloadSchema: {
			type: "object",
			properties: {
				title: {
					type: "string",
				},
				body: {
					type: "string",
				},
			},
			required: [
				"title",
				"body",
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
					subject: "{{payload.title}}",
					body: "{{payload.body}}",
				},
			},
			{
				stepId: "send-in-app",
				name: "In-app",
				type: "in_app",
				controlValues: {
					body: "{{payload.body}}",
					subject: "{{payload.title}}",
					disableOutputSanitization: false,
				},
			},
		],
	}),
};
