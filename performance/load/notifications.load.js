import http from "k6/http";
import { check, sleep } from "k6";

/** Test assumption: notification list + unread count stay paginated/aggregated. */
export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.2"],
  },
};

const BASE_URL = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "";

export default function notificationsLoad() {
  const headers = { Authorization: `Bearer ${TOKEN}` };
  const list = http.get(`${BASE_URL}/api/v1/notifications?page=1&limit=20`, { headers });
  const count = http.get(`${BASE_URL}/api/v1/notifications/unread-count`, { headers });
  check(list, { "notification list is not 5xx": (r) => r.status < 500 });
  check(count, { "unread count is not 5xx": (r) => r.status < 500 });
  sleep(1);
}
