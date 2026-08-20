import { logger } from "../config/logger";
import { isTest } from "../config/env";

type Job = {
  name: string;
  intervalMs: number;
  timer: NodeJS.Timeout | null;
  running: boolean;
  fn: () => Promise<void>;
};

const jobs = new Map<string, Job>();

export function startIntervalJob(name: string, fn: () => Promise<void>, intervalMs: number): void {
  if (isTest) return;
  stopIntervalJob(name);
  const job: Job = { name, intervalMs, timer: null, running: false, fn };
  const tick = () => {
    job.timer = setTimeout(() => {
      void (async () => {
        if (job.running) {
          tick();
          return;
        }
        job.running = true;
        try {
          await job.fn();
        } catch (error) {
          logger.error({ err: error, job: name }, "Scheduled job failed");
        } finally {
          job.running = false;
          if (jobs.has(name)) tick();
        }
      })();
    }, job.intervalMs);
  };
  jobs.set(name, job);
  tick();
  logger.info({ job: name, intervalMs }, "Scheduled job started");
}

export function stopIntervalJob(name: string): void {
  const job = jobs.get(name);
  if (!job) return;
  if (job.timer) clearTimeout(job.timer);
  jobs.delete(name);
}

export function stopAllIntervalJobs(): void {
  for (const name of [...jobs.keys()]) stopIntervalJob(name);
}
