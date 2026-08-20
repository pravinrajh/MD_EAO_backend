import http from "k6/http";
import { check, sleep } from "k6";

/**
 * Test assumption, not measured production traffic.
 * Scenario VU counts: A=100, B=500, C=1000, D=2000 via -e VUS=
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

export default function dashboardLoad() {
  const res = http.get(`${BASE_URL}/api/v1/dashboard/md`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, {
    "dashboard status is not 5xx": (r) => r.status < 500,
  });
  sleep(1);
}
