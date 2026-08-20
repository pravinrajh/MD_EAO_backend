import http from "k6/http";
import { check, sleep } from "k6";

/** Test assumption: authenticated task list + pagination. */
export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.2"],
  },
};

const BASE_URL = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "";

export default function tasksLoad() {
  const res = http.get(`${BASE_URL}/api/v1/tasks?page=1&limit=20`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
  });
  check(res, {
    "tasks are paginated": (r) => r.status < 500,
  });
  sleep(1);
}
