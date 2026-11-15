// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this workflow, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeWorkflow } from "@backend/novu/code_workflow";

export const userReminderWorkflow: CodeWorkflow = {
	updatedAt: "2026-11-15T21:45:36.000Z",
	definition: () => ({
		workflowId: "user-reminder",
		name: "Journal Reminder",
		description: "Daily nudge to write a journal entry at the user's chosen time.",
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
				reminderTime: {
					type: "string",
				},
			},
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
					subject: "{{payload.title | default: 'Time to journal ✍️'}}",
					body: "{{payload.body | default: 'Take a moment to log today’s entry.'}}",
				},
			},
			{
				stepId: "send-in-app",
				name: "In-app",
				type: "in_app",
				controlValues: {
					body: "{{payload.body | default: 'Take a moment to log today’s entry.'}}",
					subject: "{{payload.title | default: 'Time to journal ✍️'}}",
					redirect: {
						url: "/journal-entries/new",
						target: "_self",
					},
					disableOutputSanitization: false,
				},
			},
		],
	}),
};
