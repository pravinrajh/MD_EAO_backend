import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import mongoSanitize from "express-mongo-sanitize";
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
import { apiRateLimiter } from "./middlewares/rateLimit.middleware";
import { requestLogger } from "./middlewares/requestLogger.middleware";
import { errorHandler, notFoundHandler } from "./middlewares/error.middleware";

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.CORS_ORIGIN.split(",").map((origin) => origin.trim()),
      credentials: true,
    }),
  );
  app.use(compression());
  app.use(express.json({ limit: "1mb" }));
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

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
