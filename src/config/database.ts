import mongoose from "mongoose";
import { env } from "./env";
import { logger } from "./logger";

mongoose.set("strictQuery", true);

export async function connectDatabase(): Promise<typeof mongoose> {
  mongoose.set("autoIndex", env.NODE_ENV !== "production");

  await mongoose.connect(env.MONGODB_URI, {
    maxPoolSize: 50,
    minPoolSize: 5,
    serverSelectionTimeoutMS: 5000,
  });

  const safeHost = env.MONGODB_URI.replace(/\/\/.*@/, "//").split("/")[2] ?? "unknown";
  logger.info({ host: safeHost }, "MongoDB connected");
  return mongoose;
}

export async function disconnectDatabase(): Promise<void> {
  await mongoose.disconnect();
  logger.info("MongoDB disconnected");
}

export function getDatabaseState(): {
  connected: boolean;
  readyState: number;
} {
  return {
    connected: mongoose.connection.readyState === 1,
    readyState: mongoose.connection.readyState,
  };
}
