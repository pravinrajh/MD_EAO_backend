import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { assertPerformanceMongoUri, performanceMongoUri } from "./lib/perfGuard";

type Status = "executed" | "not_executed";

type Section = {
  name: string;
  status: Status;
  command: string;
  reason?: string;
  outputFile?: string;
};

function which(binary: string): boolean {
  const result = spawnSync("which", [binary], { encoding: "utf8" });
  return result.status === 0;
}

function writeReport(sections: Section[]): void {
  const outDir = path.resolve(process.cwd(), "test-report");
  fs.mkdirSync(outDir, { recursive: true });
  const payload = {
    executedAt: new Date().toISOString(),
    note: "This file records whether optional performance jobs ran. It does not invent latency numbers.",
    sections,
  };
  fs.writeFileSync(path.join(outDir, "performance-results.json"), JSON.stringify(payload, null, 2));
  console.log(JSON.stringify(payload, null, 2));
}

function main(): void {
  const sections: Section[] = [];
  const scenario = process.env.PERF_SCENARIO || "A";
  const vus = process.env.VUS || (scenario === "D" ? "2000" : scenario === "C" ? "1000" : scenario === "B" ? "500" : "100");
  const baseUrl = process.env.PERF_BASE_URL || `http://localhost:${process.env.PORT || "5000"}`;
  const k6Script = process.env.K6_SCRIPT || "performance/load/mixed.load.js";

  try {
    const uri = performanceMongoUri();
    assertPerformanceMongoUri(uri, "Explain");
    const explain = spawnSync("npx", ["tsx", "scripts/explain-queries.ts"], {
      encoding: "utf8",
      env: process.env,
      stdio: "inherit",
    });
    sections.push({
      name: "mongodb-explain",
      status: explain.status === 0 ? "executed" : "not_executed",
      command: "npm run perf:explain",
      reason: explain.status === 0 ? undefined : "explain-queries.ts exited non-zero",
      outputFile: "test-report/mongodb-explain-results.json",
    });
  } catch (error) {
    sections.push({
      name: "mongodb-explain",
      status: "not_executed",
      command: "PERF_MONGODB_URI=mongodb://127.0.0.1:27017/ai_md_performance npm run perf:explain",
      reason: error instanceof Error ? error.message : "Performance MongoDB URI not configured",
    });
  }

  if (!which("k6")) {
    sections.push({
      name: "k6-load",
      status: "not_executed",
      command: `k6 run -e BASE_URL=${baseUrl} -e VUS=${vus} -e TOKEN=$TOKEN ${k6Script}`,
      reason: "k6 binary is not installed. Install with: brew install k6",
    });
    writeReport(sections);
    return;
  }

  if (!process.env.TOKEN && !process.env.PERF_ACCESS_TOKEN) {
    sections.push({
      name: "k6-load",
      status: "not_executed",
      command: `k6 run -e BASE_URL=${baseUrl} -e VUS=${vus} -e TOKEN=$TOKEN ${k6Script}`,
      reason: "TOKEN or PERF_ACCESS_TOKEN is required so load tests hit authenticated APIs. The API process must already be running.",
    });
    writeReport(sections);
    return;
  }

  const env = {
    ...process.env,
    BASE_URL: baseUrl,
    VUS: String(vus),
    TOKEN: process.env.TOKEN || process.env.PERF_ACCESS_TOKEN || "",
  };
  const run = spawnSync("k6", ["run", k6Script], { encoding: "utf8", env, stdio: "inherit" });
  sections.push({
    name: "k6-load",
    status: run.status === 0 ? "executed" : "not_executed",
    command: `k6 run -e BASE_URL=${baseUrl} -e VUS=${vus} -e TOKEN=$TOKEN ${k6Script}`,
    reason: run.status === 0 ? undefined : "k6 exited non-zero",
  });
  writeReport(sections);
  if (run.status !== 0) process.exit(run.status ?? 1);
}

main();
