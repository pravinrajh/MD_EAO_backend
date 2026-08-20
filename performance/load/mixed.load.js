import http from "k6/http";
import { check, sleep } from "k6";

/**
 * Mixed workload — TEST ASSUMPTIONS, not claimed production traffic:
 * 30% dashboard, 20% tasks, 10% projects, 10% meetings, 10% CRM,
 * 5% finance, 5% assistant query, 5% notifications, 5% reminders.
 *
 * Scenario VU counts (pass -e VUS=):
 *   A=100  B=500  C=1000  D=2000
 */
export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.2"],
  },
};

const BASE_URL = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "";

function headers() {
  return { Authorization: `Bearer ${TOKEN}` };
}

function jsonHeaders() {
  return { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" };
}

function pick(roll) {
  if (roll < 30) return ["GET", "/api/v1/dashboard/md"];
  if (roll < 50) return ["GET", "/api/v1/tasks?page=1&limit=20"];
  if (roll < 60) return ["GET", "/api/v1/projects?page=1&limit=20"];
  if (roll < 70) return ["GET", "/api/v1/meetings?page=1&limit=20"];
  if (roll < 80) return ["GET", "/api/v1/leads?page=1&limit=20"];
  if (roll < 85) return ["GET", "/api/v1/finance/summary"];
  if (roll < 90) return ["POST", "/api/v1/assistant/query"];
  if (roll < 95) return ["GET", "/api/v1/notifications/unread-count"];
  return ["GET", "/api/v1/reminders?page=1&limit=20"];
}

export default function mixedLoad() {
  const roll = Math.random() * 100;
  const [method, path] = pick(roll);
  const url = `${BASE_URL}${path}`;
  const res =
    method === "POST"
      ? http.post(url, JSON.stringify({ message: "What tasks are pending?" }), { headers: jsonHeaders() })
      : http.get(url, { headers: headers() });
  check(res, {
    "mixed request is not 5xx": (r) => r.status < 500,
  });
  sleep(1);
}
