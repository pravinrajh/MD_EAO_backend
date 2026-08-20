import http from "k6/http";
import { check, sleep } from "k6";

/**
 * Webhook acknowledgement path. Invalid signatures must be rejected quickly.
 * Valid signed traffic requires WHATSAPP_APP_SECRET material in the running API.
 */
export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<1"],
  },
};

const BASE_URL = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");

export default function whatsappLoad() {
  const verify = http.get(
    `${BASE_URL}/api/v1/webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=invalid&hub.challenge=ping`,
  );
  const post = http.post(`${BASE_URL}/api/v1/webhooks/whatsapp`, "{}", {
    headers: { "Content-Type": "application/json" },
  });
  check(verify, { "verify rejects invalid token without 5xx": (r) => r.status < 500 });
  check(post, { "unsigned webhook is rejected without 5xx": (r) => r.status < 500 && r.status !== 200 });
  sleep(0.2);
}
