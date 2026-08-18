import mongoose, { type ClientSession } from "mongoose";
import { logger } from "../config/logger";

function isReplicaSet(): boolean {
  const client = mongoose.connection.getClient();
  const topology = (client as unknown as { topology?: { description?: { type?: string } } }).topology;
  const type = topology?.description?.type;
  return type === "ReplicaSetWithPrimary" || type === "ReplicaSetNoPrimary" || type === "Sharded";
}

/**
 * Runs work in a MongoDB transaction when the deployment supports it (replica set / mongos).
 * Standalone (including typical test memory servers) executes the callback without a session.
 */
export async function withTransaction<T>(fn: (session: ClientSession | null) => Promise<T>): Promise<T> {
  if (!isReplicaSet()) {
    return fn(null);
  }

  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } catch (error) {
    logger.warn({ err: error }, "Transaction failed");
    throw error;
  } finally {
    await session.endSession();
  }
}
