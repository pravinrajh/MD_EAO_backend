import { createApp } from "./app";
import { connectDatabase } from "./config/database";
import { env } from "./config/env";
import { logger } from "./config/logger";
import { startReminderWorker, stopReminderWorker } from "./workers/reminder.worker";
import { startWhatsAppWorker, stopWhatsAppWorker } from "./workers/whatsapp.worker";

async function start(): Promise<void> {
  await connectDatabase();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV, docs: `http://localhost:${env.PORT}/api-docs` }, "AIBOtBackend listening");
  });

  server.on("error", (error: NodeJS.ErrnoException) => {
    if (error.code === "EADDRINUSE") {
      const airplayHint =
        env.PORT === 5000
          ? " macOS AirPlay Receiver commonly occupies port 5000 and answers with HTTP 403. Set PORT=5050 in .env, or disable AirPlay Receiver in System Settings → General → AirDrop & Handoff."
          : "";
      logger.fatal({ port: env.PORT }, `Port ${env.PORT} is already in use.${airplayHint}`);
      process.exit(1);
    }
    throw error;
  });

  startReminderWorker();
  startWhatsAppWorker();

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Shutting down");
    stopReminderWorker();
    stopWhatsAppWorker();
    server.close(() => {
      process.exit(0);
    });
  };

  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

start().catch((error) => {
  logger.fatal({ err: error }, "Failed to start server");
  process.exit(1);
});
