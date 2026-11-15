// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this workflow, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeWorkflow } from "@backend/novu/code_workflow";

export const teamInvitationWorkflow: CodeWorkflow = {
	updatedAt: "2026-11-15T21:45:36.000Z",
	definition: (input) => ({
		workflowId: "team-invitation",
		name: "Team invitation",
		description: "Sent when an Owner or Admin adds someone to a team by email. They open the app with that address to join.",
		active: true,
		payloadSchema: {
			type: "object",
			properties: {
				appName: {
					type: "string",
				},
				email: {
					type: "string",
				},
				inviterName: {
					type: "string",
				},
				name: {
					type: "string",
				},
				role: {
					type: "string",
				},
				teamName: {
					type: "string",
				},
				url: {
					type: "string",
				},
			},
			required: [
				"teamName",
				"role",
				"inviterName",
				"email",
				"url",
				"appName",
			],
		},
		isTranslationEnabled: false,
		severity: "none",
		source: "dashboard",
		steps: [
			{
				stepId: "send-email",
				name: "Email",
				type: "email",
				controlValues: {
					subject: "{{payload.inviterName}} added you to {{payload.teamName}}",
					body: `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e3e5e8;border-radius:10px;">
	<tr><td style="padding:32px 40px 36px;font-size:15px;line-height:23px;color:#1f2328;">
<h1 style="margin:0 0 16px;font-size:24px;line-height:30px;font-weight:600;color:#1f2328;">Join {{payload.teamName | escape}}</h1>
<p style="margin:0 0 16px;">Hi{% if payload.name %} {{payload.name | escape}}{% endif %}, {{payload.inviterName | escape}} added you to {{payload.teamName | escape}} as {{payload.role | escape}}.</p>
<p style="margin:0 0 24px;">Open {{payload.appName | escape}} to join: sign in with Google or Apple using {{payload.email | escape}} (or just open it, if you already use it with this address), and {{payload.teamName | escape}} is there.</p>
<p style="margin:0;"><a href="{{payload.url | default: '${input.appUrl}' | escape}}" style="display:inline-block;background:#1976d2;color:#ffffff;text-decoration:none;font-size:15px;line-height:20px;font-weight:600;padding:12px 22px;border-radius:6px;">Open {{payload.appName | escape}}</a></p>
	</td></tr>
</table>`,
					editorType: "html",
					disableOutputSanitization: false,
					layoutId: "app",
				},
			},
		],
	}),
};
