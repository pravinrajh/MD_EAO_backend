import { REMINDER_WORKER_INTERVAL_MS } from "../utils/constants";
import { reminderService } from "../services/reminder.service";
import { startIntervalJob, stopIntervalJob } from "./scheduler";

const JOB_NAME = "reminder-processor";

export async function processDueReminders(now = new Date()) {
  return reminderService.processDueReminders(now);
}

export function startReminderWorker(intervalMs = REMINDER_WORKER_INTERVAL_MS): void {
  startIntervalJob(JOB_NAME, async () => {
    await processDueReminders();
  }, intervalMs);
}

export function stopReminderWorker(): void {
  stopIntervalJob(JOB_NAME);
}
