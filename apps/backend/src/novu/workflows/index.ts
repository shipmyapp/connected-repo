// Kept in step with the Novu dashboard (newer updatedAt wins at boot). Before editing this workflow, run `yarn novu:status` (skill novu-pull); a hand edit sets updatedAt to now.
import type { CodeWorkflow } from "@backend/novu/code_workflow";
import { journalEntryCreatedWorkflow } from "./journal_entry_created.workflow";
import { teamInvitationWorkflow } from "./team_invitation.workflow";
import { testPushWorkflow } from "./test_push.workflow";
import { userCreatedWorkflow } from "./user_created.workflow";
import { userReminderWorkflow } from "./user_reminder.workflow";

// Every workflow ensureNovuWorkflows keeps in a Novu environment.
export const novuWorkflows: CodeWorkflow[] = [
	journalEntryCreatedWorkflow,
	teamInvitationWorkflow,
	testPushWorkflow,
	userCreatedWorkflow,
	userReminderWorkflow,
];
