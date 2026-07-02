import { workflow } from "@novu/framework";

/**
 * Welcome notification — triggered once from the user.created pg-tbus handler
 * (apps/backend/src/modules/users/notifications/user_created.notifications.user.ts)
 * right after the Novu subscriber is upserted on signup.
 *
 * Push step fires an OS notification (if the user has push enabled);
 * In-app step is always visible in the Inbox bell regardless of push, and
 * links to /profile so the user can finish setting up their account.
 */
export const userCreatedWorkflow = workflow(
	"user-created",
	async ({ step, payload }) => {
		await step.push("send-push", async () => ({
			subject: `Welcome, ${payload.name} 👋`,
			body: "Thanks for joining — your account is ready.",
		}));

		await step.inApp("send-in-app", async () => ({
			subject: `Welcome, ${payload.name} 👋`,
			body: "Thanks for joining — finish setting up your profile to get started.",
			redirect: { url: "/profile" },
		}));
	},
	{
		payloadSchema: {
			type: "object",
			properties: {
				name: { type: "string", default: "there" },
			},
			required: ["name"],
			additionalProperties: false,
		} as const,
		name: "Welcome",
		description: "One-time welcome notification sent when a user signs up.",
	},
);
