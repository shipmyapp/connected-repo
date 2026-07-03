import { workflow } from "@novu/framework";

/**
 * Journal-entry-created fan-out — triggered per entry from the create
 * handler AND the pushCreates service tail (for offline-created entries
 * that finally landed). Routed to the team topic `team:{teamId}` so
 * Novu handles the per-subscriber fan-out; the author is excluded via
 * `actor` on the trigger call (Novu skips subscribers matching the
 * actor when the topic is targeted).
 *
 * Push step fires an OS notification on team members' registered
 * devices; in-app step lands in the Inbox bell so team members see
 * it even without push permission. Redirect deep-links to the entry.
 */
export const journalEntryCreatedWorkflow = workflow(
	"journal-entry-created",
	async ({ step, payload }) => {
		await step.push("send-push", async () => ({
			subject: `${payload.authorName} added a journal entry`,
			body: payload.contentPreview || "Tap to read.",
		}));

		await step.inApp("send-in-app", async () => ({
			subject: `${payload.authorName} added a journal entry`,
			body: payload.contentPreview || "Tap to read.",
			redirect: { url: `/journal-entries/${payload.entryId}` },
		}));
	},
	{
		payloadSchema: {
			type: "object",
			properties: {
				entryId: { type: "string" },
				authorName: { type: "string", default: "A teammate" },
				contentPreview: { type: "string", default: "" },
			},
			required: ["entryId", "authorName"],
			additionalProperties: false,
		} as const,
		name: "Journal Entry Created",
		description:
			"Notifies team members (excluding the author) when a new journal entry lands.",
	},
);
