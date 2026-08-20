import { WHATSAPP_WORKER_INTERVAL_MS } from "../utils/constants";
import { whatsAppWebhookService } from "../services/whatsapp/whatsappWebhook.service";
import { startIntervalJob, stopIntervalJob } from "./scheduler";

const JOB_NAME = "whatsapp-processor";

export async function processWhatsAppQueue() {
  return whatsAppWebhookService.processQueuedEvents();
}

export function startWhatsAppWorker(intervalMs = WHATSAPP_WORKER_INTERVAL_MS): void {
  startIntervalJob(JOB_NAME, async () => {
    await processWhatsAppQueue();
  }, intervalMs);
}

export function stopWhatsAppWorker(): void {
  stopIntervalJob(JOB_NAME);
}
