// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this workflow, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeWorkflow } from "@backend/novu/code_workflow";

export const userCreatedWorkflow: CodeWorkflow = {
	updatedAt: "2026-11-15T21:45:36.000Z",
	definition: () => ({
		workflowId: "user-created",
		name: "Welcome",
		description: "One-time welcome notification sent when a user signs up.",
		active: true,
		payloadSchema: {
			type: "object",
			properties: {
				name: {
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
					subject: "Welcome, {{payload.name | default: 'there'}} 👋",
					body: "Thanks for joining — your account is ready.",
				},
			},
			{
				stepId: "send-in-app",
				name: "In-app",
				type: "in_app",
				controlValues: {
					body: "Thanks for joining — finish setting up your profile to get started.",
					subject: "Welcome, {{payload.name | default: 'there'}} 👋",
					redirect: {
						url: "/profile",
						target: "_self",
					},
					disableOutputSanitization: false,
				},
			},
		],
	}),
};
