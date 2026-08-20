import mongoose from "mongoose";
import { logger } from "../src/config/logger";
import { assertPerformanceMongoUri, performanceMongoUri } from "./lib/perfGuard";

async function cleanup(): Promise<void> {
  if (process.env.CONFIRM_PERF_CLEANUP !== "YES") {
    throw new Error(
      "Refusing cleanup. Set CONFIRM_PERF_CLEANUP=YES and PERF_MONGODB_URI to a *performance* database.",
    );
  }

  const uri = performanceMongoUri();
  const dbName = assertPerformanceMongoUri(uri, "Performance cleanup");
  await mongoose.connect(uri);
  const dropped = await mongoose.connection.dropDatabase();
  logger.info({ dbName, dropped }, "Performance database dropped");
  await mongoose.disconnect();
}

cleanup().catch((error) => {
  logger.fatal({ err: error }, "Performance cleanup failed");
  process.exit(1);
});
