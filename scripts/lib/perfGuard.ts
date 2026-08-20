/**
 * Guards that keep performance seed/cleanup/explain off production,
 * the developer database, and the automated test database.
 */

const FORBIDDEN_DB_NAMES = new Set([
  "md_ai_office",
  "ai_md_test",
  "admin",
  "local",
  "config",
  "test",
  "production",
  "prod",
]);

export function databaseNameFromUri(uri: string): string {
  const withoutQuery = uri.split("?")[0] ?? "";
  const parts = withoutQuery.split("/");
  return decodeURIComponent(parts[parts.length - 1] ?? "").trim();
}

export function assertPerformanceMongoUri(uri: string, action: string): string {
  if (!uri) {
    throw new Error(`${action} requires PERF_MONGODB_URI or a performance MONGODB_URI`);
  }
  if (/production|prod/i.test(process.env.NODE_ENV ?? "")) {
    throw new Error(`${action} refuses to run when NODE_ENV is production`);
  }

  const name = databaseNameFromUri(uri);
  if (!name) {
    throw new Error(`${action} could not parse a database name from the MongoDB URI`);
  }
  if (FORBIDDEN_DB_NAMES.has(name.toLowerCase())) {
    throw new Error(`${action} refused database "${name}". Use a dedicated *performance* database.`);
  }
  if (!/performance/i.test(name)) {
    throw new Error(
      `${action} refused database "${name}". The database name must contain "performance" (example: ai_md_performance).`,
    );
  }
  return name;
}

export function performanceMongoUri(): string {
  return (process.env.PERF_MONGODB_URI || process.env.MONGODB_URI || "").trim();
}
