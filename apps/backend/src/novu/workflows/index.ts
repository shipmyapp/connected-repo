import { journalEntryCreatedWorkflow } from "./journal_entry_created.workflow";
import { userCreatedWorkflow } from "./user_created.workflow";
import { userReminderWorkflow } from "./user_reminder.workflow";

export const novuWorkflows = [
	userCreatedWorkflow,
	userReminderWorkflow,
	journalEntryCreatedWorkflow,
];
