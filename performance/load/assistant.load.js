import http from "k6/http";
import { check, sleep } from "k6";

/** Test assumption: common assistant query intents. */
export const options = {
  vus: Number(__ENV.VUS || 10),
  duration: __ENV.DURATION || "30s",
  thresholds: {
    http_req_failed: ["rate<0.2"],
  },
};

const BASE_URL = (__ENV.BASE_URL || "http://localhost:5000").replace(/\/$/, "");
const TOKEN = __ENV.TOKEN || "";

const MESSAGES = [
  "What tasks are pending?",
  "How is sales?",
  "How much money came in this month?",
  "Give me today's report.",
  "How is Chennai project?",
];

export default function assistantLoad() {
  const message = MESSAGES[Math.floor(Math.random() * MESSAGES.length)];
  const res = http.post(
    `${BASE_URL}/api/v1/assistant/query`,
    JSON.stringify({ message }),
    {
      headers: {
        Authorization: `Bearer ${TOKEN}`,
        "Content-Type": "application/json",
      },
    },
  );
  check(res, {
    "assistant query is not 5xx": (r) => r.status < 500,
  });
  sleep(1);
}
