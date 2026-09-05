import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
import path from "node:path";
import { env } from "./config/env";
import { API_PREFIX } from "./utils/constants";
import healthRoutes from "./routes/health.routes";
import authRoutes from "./routes/auth.routes";
import userRoutes from "./routes/user.routes";
import employeeRoutes from "./routes/employee.routes";
import taskRoutes from "./routes/task.routes";
import projectRoutes from "./routes/project.routes";
import meetingRoutes from "./routes/meeting.routes";
import leadRoutes from "./routes/lead.routes";
import customerRoutes from "./routes/customer.routes";
import opportunityRoutes from "./routes/opportunity.routes";
import salesActivityRoutes from "./routes/salesActivity.routes";
import salesRoutes from "./routes/sales.routes";
import financeRoutes from "./routes/finance.routes";
import dashboardRoutes from "./routes/dashboard.routes";
import assistantRoutes from "./routes/assistant.routes";
import assistantActionRoutes from "./routes/assistantAction.routes";
import aiRoutes from "./routes/ai.routes";
import reminderRoutes from "./routes/reminder.routes";
import notificationRoutes from "./routes/notification.routes";
import notificationPreferenceRoutes from "./routes/notificationPreference.routes";
import invoiceRoutes from "./routes/invoice.routes";
import vendorRoutes from "./routes/vendor.routes";
import landParcelRoutes from "./routes/landParcel.routes";
import mdNoteRoutes from "./routes/mdNote.routes";
import whatsAppWebhookRoutes from "./routes/whatsappWebhook.routes";
import whatsAppLinkRoutes from "./routes/whatsappLink.routes";
import { apiRateLimiter } from "./middlewares/rateLimit.middleware";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";
import { mountSwagger } from "./config/swagger";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  // Flutter web (`flutter run -d chrome`) binds a random localhost port on every
  // run, so a fixed allow-list rejects the dev frontend. In development any
  // localhost/127.0.0.1 origin is accepted; production stays on CORS_ORIGIN.
  const allowedOrigins = env.CORS_ORIGIN.split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  const isLoopbackOrigin = (origin: string) =>
    /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

  app.use(
    cors({
      origin: (origin, callback) => {
        // Same-origin, curl and native apps (Flutter macOS/iOS/Android) send no Origin.
        if (!origin) return callback(null, true);
        if (allowedOrigins.includes(origin)) return callback(null, true);
        if (env.NODE_ENV !== "production" && isLoopbackOrigin(origin)) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(
    express.json({
      limit: "1mb",
      verify: (req, _res, buf) => {
        (req as express.Request).rawBody = Buffer.from(buf);
      },
    }),
  );
  app.use(express.urlencoded({ extended: true }));
  app.use(mongoSanitize());
  app.use(requestLogger);
  app.use(apiRateLimiter);

  app.use(`${API_PREFIX}/health`, healthRoutes);
  app.use(`${API_PREFIX}/auth`, authRoutes);
  app.use(`${API_PREFIX}/users`, userRoutes);
  app.use(`${API_PREFIX}/employees`, employeeRoutes);
  app.use(`${API_PREFIX}/tasks`, taskRoutes);
  app.use(`${API_PREFIX}/projects`, projectRoutes);
  app.use(`${API_PREFIX}/meetings`, meetingRoutes);
  app.use(`${API_PREFIX}/leads`, leadRoutes);
  app.use(`${API_PREFIX}/customers`, customerRoutes);
  app.use(`${API_PREFIX}/opportunities`, opportunityRoutes);
  app.use(`${API_PREFIX}/sales-activities`, salesActivityRoutes);
  app.use(`${API_PREFIX}/sales`, salesRoutes);
  app.use(`${API_PREFIX}/finance`, financeRoutes);
  app.use(`${API_PREFIX}/dashboard`, dashboardRoutes);
  app.use(`${API_PREFIX}/assistant`, assistantRoutes);
  app.use(`${API_PREFIX}/assistant`, assistantActionRoutes);
  app.use(`${API_PREFIX}/ai`, aiRoutes);
  app.use(`${API_PREFIX}/reminders`, reminderRoutes);
  app.use(`${API_PREFIX}/invoices`, invoiceRoutes);
  app.use(`${API_PREFIX}/vendors`, vendorRoutes);
  app.use(`${API_PREFIX}/land-parcels`, landParcelRoutes);
  app.use(`${API_PREFIX}/md-notes`, mdNoteRoutes);
  app.use(`${API_PREFIX}/notifications`, notificationRoutes);
  app.use(`${API_PREFIX}/notification-preferences`, notificationPreferenceRoutes);
  app.use(`${API_PREFIX}/webhooks/whatsapp`, whatsAppWebhookRoutes);
  app.use(`${API_PREFIX}/whatsapp`, whatsAppLinkRoutes);

  mountSwagger(app);

  const chatDir = path.join(process.cwd(), "public", "chat");
  app.use("/chat", express.static(chatDir));

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
