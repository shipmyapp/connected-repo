import { scheduleJournalEntryReminders } from "@backend/modules/journal-entries/services/schedule_reminders.journal_entries.service";
import { logger } from '@backend/utils/logger.utils';
import * as cron from 'node-cron';

// Mutex flag to prevent concurrent cron job execution
let isCronJobRunning = false;

// Schedule to run every minute
// TODO: Add scheduled tasks here as needed (e.g., user reminders via pg-tbus)
export const perMinuteCronJobs: cron.ScheduledTask = cron.schedule(
	'* * * * *',
	async () => {
		// Check if previous job is still running
		if (isCronJobRunning) {
			logger.warn('Skipping cron job - previous job still running');
			return;
		}

		// Acquire mutex lock
		isCronJobRunning = true;

		try {
			logger.info('Running scheduled per-minute cron jobs...');

			// Schedule journal entry reminders for users
			await scheduleJournalEntryReminders();

			logger.info(
				"Cron job completed successfully",
			);

		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(
				{
					error: errorMessage,
				},
				'Error running per-minute cron job',
			);
		} finally {
			// Release mutex lock
			isCronJobRunning = false;
		}
	}
);
