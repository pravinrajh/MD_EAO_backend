import bcrypt from "bcrypt";
import crypto from "crypto";
import { randomUUID } from "crypto";
import mongoose from "mongoose";
import request from "supertest";
import { createApp } from "../src/app";
import { env } from "../src/config/env";
import { Employee } from "../src/models/Employee";
import { Meeting } from "../src/models/Meeting";
import { Task } from "../src/models/Task";
import { User } from "../src/models/User";
import { WhatsAppEvent } from "../src/models/WhatsAppEvent";
import { WhatsAppIdentity } from "../src/models/WhatsAppIdentity";
import { WhatsAppLinkCode } from "../src/models/WhatsAppLinkCode";
import { WhatsAppMessage } from "../src/models/WhatsAppMessage";
import { setWhatsAppProvider } from "../src/integrations/whatsapp";
import { MetaWhatsAppProvider, WhatsAppProviderRequestError } from "../src/integrations/whatsapp/metaWhatsApp.provider";
import { mapMetaPayload } from "../src/integrations/whatsapp/whatsappMessage.mapper";
import type { SendTextResult, WhatsAppProvider, WhatsAppVerifyQuery } from "../src/integrations/whatsapp/whatsappProvider.interface";
import { whatsAppMessagingService } from "../src/services/whatsapp/whatsappMessaging.service";
import type { Role } from "../src/utils/constants";
import { nextEmployeeCode, nextMeetingId } from "../src/utils/sequence";
import { getZonedDayRange } from "../src/utils/timezone";
import { processWhatsAppQueue } from "../src/workers/whatsapp.worker";
import { clearCollections, setupTestDb, teardownTestDb } from "./helpers";

const app = createApp();
const meta = new MetaWhatsAppProvider();

class MemoryProvider implements WhatsAppProvider {
  readonly name = "meta";
  sent: Array<{ phoneNumber: string; message: string }> = [];
  failWith: { statusCode: number; retryable: boolean } | null = null;
  failTimes = 0;

  verifyWebhook(query: WhatsAppVerifyQuery, token: string) {
    return meta.verifyWebhook(query, token);
  }
  verifySignature(raw: Buffer, header: string | undefined, secret: string) {
    return meta.verifySignature(raw, header, secret);
  }
  parseIncomingPayload(payload: unknown) {
    return mapMetaPayload(payload);
  }
  async sendTextMessage(phoneNumber: string, message: string): Promise<SendTextResult> {
    if (this.failWith && this.failTimes !== 0) {
      if (this.failTimes > 0) this.failTimes -= 1;
      throw new WhatsAppProviderRequestError("provider error", this.failWith.statusCode, this.failWith.retryable);
    }
    this.sent.push({ phoneNumber, message });
    return { providerMessageId: `wamid.out.${this.sent.length}`, statusCode: 200 };
  }
}

const memory = new MemoryProvider();

function sign(raw: string) {
  return `sha256=${crypto.createHmac("sha256", env.WHATSAPP_APP_SECRET).update(raw).digest("hex")}`;
}

function inboundPayload(from: string, text: string, id: string, type = "text") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              messages: [
                {
                  from,
                  id,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type,
                  text: type === "text" ? { body: text } : undefined,
                  image: type === "image" ? { id: "img-1" } : undefined,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

function statusPayload(messageId: string, status: string, to: string) {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        changes: [
          {
            value: {
              statuses: [
                {
                  id: messageId,
                  status,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  recipient_id: to,
                },
              ],
            },
          },
        ],
      },
    ],
  };
}

async function postWebhook(body: unknown) {
  const raw = JSON.stringify(body);
  return request(app)
    .post("/api/v1/webhooks/whatsapp")
    .set("Content-Type", "application/json")
    .set("x-hub-signature-256", sign(raw))
    .send(raw);
}

async function ingest(from: string, text: string, id: string, type = "text") {
  const response = await postWebhook(inboundPayload(from, text, id, type));
  await processWhatsAppQueue();
  return response;
}

async function createUser(role: Role, email: string, phone: string) {
  return User.create({
    name: `${role} ${email.split("@")[0]}`,
    email,
    phone,
    passwordHash: await bcrypt.hash("SecurePassword123", 4),
    role,
    status: "ACTIVE",
    isActive: true,
  });
}

async function createEmployeeForUser(user: { _id: mongoose.Types.ObjectId; email: string }, phone: string) {
  return Employee.create({
    employeeId: randomUUID(),
    userId: user._id,
    employeeCode: await nextEmployeeCode(),
    firstName: user.email.split("@")[0],
    lastName: "Worker",
    displayName: `${user.email.split("@")[0]} Worker`,
    email: user.email,
    phone,
    employmentType: "FULL_TIME",
    status: "ACTIVE",
  });
}

async function loginAs(email: string) {
  const response = await request(app).post("/api/v1/auth/login").send({
    email,
    password: "SecurePassword123",
  });
  return response.body.data as { accessToken: string; user: { id: string; role: string } };
}

function auth(token: string) {
  return { Authorization: `Bearer ${token}` };
}

describe("WhatsApp webhook API", () => {
  beforeAll(async () => {
    await setupTestDb();
    await Promise.all([
      WhatsAppEvent.syncIndexes(),
      WhatsAppMessage.syncIndexes(),
      WhatsAppIdentity.syncIndexes(),
      WhatsAppLinkCode.syncIndexes(),
    ]);
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  beforeEach(async () => {
    await clearCollections();
    memory.sent = [];
    memory.failWith = null;
    memory.failTimes = 0;
    setWhatsAppProvider(memory);
  });

  afterEach(() => {
    setWhatsAppProvider(null);
  });

  it("verifies the webhook challenge and rejects invalid tokens", async () => {
    const ok = await request(app).get("/api/v1/webhooks/whatsapp").query({
      "hub.mode": "subscribe",
      "hub.verify_token": env.WHATSAPP_VERIFY_TOKEN,
      "hub.challenge": "challenge-token",
    });
    expect(ok.status).toBe(200);
    expect(ok.text).toBe("challenge-token");

    const bad = await request(app).get("/api/v1/webhooks/whatsapp").query({
      "hub.mode": "subscribe",
      "hub.verify_token": "wrong",
      "hub.challenge": "challenge-token",
    });
    expect(bad.status).toBe(403);

    const missing = await request(app).get("/api/v1/webhooks/whatsapp");
    expect(missing.status).toBe(403);
  });

  it("validates webhook signatures", async () => {
    const body = inboundPayload("919876500801", "hello", "wamid.sig");
    const raw = JSON.stringify(body);
    const missing = await request(app)
      .post("/api/v1/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .send(raw);
    expect(missing.status).toBe(401);

    const invalid = await request(app)
      .post("/api/v1/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", "sha256=deadbeef")
      .send(raw);
    expect(invalid.status).toBe(403);

    const valid = await request(app)
      .post("/api/v1/webhooks/whatsapp")
      .set("Content-Type", "application/json")
      .set("x-hub-signature-256", sign(raw))
      .send(raw);
    expect(valid.status).toBe(200);
  });

  it("does not expose company data to an unknown number", async () => {
    await ingest("919876500801", "Tell me company finance", "wamid.unknown");
    expect(memory.sent[0]?.message).toMatch(/not linked to an account/i);
  });

  it("links a WhatsApp number with a one-time code and answers queries", async () => {
    const user = await createUser("ADMIN", "admin@example.com", "9876500801");
    await createEmployeeForUser(user, "9876500801");
    const session = await loginAs("admin@example.com");
    const codeRes = await request(app).post("/api/v1/whatsapp/link-code").set(auth(session.accessToken));
    expect(codeRes.status).toBe(201);
    const code = codeRes.body.data.code as string;
    expect(code).toMatch(/^\d{6}$/);

    await ingest("919876500801", `LINK ${code}`, "wamid.link");
    expect(memory.sent.at(-1)?.message).toMatch(/now linked/i);

    const reused = await ingest("919876500801", `LINK ${code}`, "wamid.link2");
    expect(reused.status).toBe(200);
    expect(memory.sent.at(-1)?.message).toMatch(/invalid or expired/i);

    await ingest("919876500801", "What tasks are pending?", "wamid.query");
    expect(memory.sent.at(-1)?.message.toLowerCase()).toMatch(/task/);
  });

  it("rejects expired, invalid, and cross-user link codes", async () => {
    const admin = await createUser("ADMIN", "admin@example.com", "9876500801");
    void admin;
    const other = await createUser("EMPLOYEE", "raj@example.com", "9876500802");
    void other;
    const adminSession = await loginAs("admin@example.com");
    const rajSession = await loginAs("raj@example.com");
    const codeRes = await request(app).post("/api/v1/whatsapp/link-code").set(auth(adminSession.accessToken));
    const code = codeRes.body.data.code as string;

    await ingest("919876500802", `LINK ${code}`, "wamid.otherphone");
    const identity = await WhatsAppIdentity.findOne({ phoneNumber: "+919876500802" });
    expect(String(identity?.userId)).toBe(String(adminSession.user.id));

    const rajCode = await request(app).post("/api/v1/whatsapp/link-code").set(auth(rajSession.accessToken));
    await ingest("919876500802", `LINK ${rajCode.body.data.code}`, "wamid.taken");
    expect(memory.sent.at(-1)?.message).toMatch(/already linked/i);

    await ingest("919876500899", "LINK 000000", "wamid.bad");
    expect(memory.sent.at(-1)?.message).toMatch(/invalid or expired/i);

    const expiring = await request(app).post("/api/v1/whatsapp/link-code").set(auth(adminSession.accessToken));
    expect(expiring.status).toBe(201);
    await WhatsAppLinkCode.updateMany({ status: "PENDING" }, { $set: { expiresAt: new Date(Date.now() - 60_000) } });
    await ingest("919876500877", `LINK ${expiring.body.data.code}`, "wamid.expired");
    expect(memory.sent.at(-1)?.message).toMatch(/invalid or expired/i);

    const cancelled = await request(app).delete("/api/v1/whatsapp/link-code").set(auth(rajSession.accessToken));
    expect(cancelled.status).toBe(200);
  });

  it("ignores duplicate webhook deliveries and unsupported media", async () => {
    const user = await createUser("ADMIN", "admin@example.com", "9876500801");
    await createEmployeeForUser(user, "9876500801");
    const session = await loginAs("admin@example.com");
    const code = (await request(app).post("/api/v1/whatsapp/link-code").set(auth(session.accessToken))).body.data.code;
    await ingest("919876500801", `LINK ${code}`, "wamid.link-dup");

    const body = inboundPayload("919876500801", "Create a task to call ABC tomorrow", "wamid.dup-action");
    await postWebhook(body);
    await postWebhook(body);
    await processWhatsAppQueue();
    await processWhatsAppQueue();
    expect(await WhatsAppMessage.countDocuments({ direction: "INBOUND", providerMessageId: "wamid.dup-action" })).toBe(1);
    expect(await Task.countDocuments({ title: /call ABC/i })).toBeLessThanOrEqual(1);

    await ingest("919876500801", "", "wamid.image", "image");
    expect(memory.sent.at(-1)?.message).toMatch(/support text-based/i);
  });

  it("does not process assistant requests for a blocked identity", async () => {
    const user = await createUser("ADMIN", "admin@example.com", "9876500801");
    await WhatsAppIdentity.create({
      identityId: "WAID-000001",
      userId: user._id,
      phoneNumber: "+919876500801",
      provider: "meta",
      verified: true,
      status: "BLOCKED",
    });
    await ingest("919876500801", "What tasks are pending?", "wamid.blocked");
    expect(memory.sent.at(-1)?.message).toMatch(/can't process this request/i);
  });

  it("maps yes to the pending confirmation for the same conversation only", async () => {
    const admin = await createUser("ADMIN", "admin@example.com", "9876500801");
    const emp = await createEmployeeForUser(admin, "9876500801");
    const session = await loginAs("admin@example.com");
    const today = getZonedDayRange(new Date(), "Asia/Kolkata");
    const tomorrow = getZonedDayRange(new Date(today.end.getTime() + 12 * 60 * 60 * 1000), "Asia/Kolkata");
    await Meeting.create({
      meetingId: await nextMeetingId(),
      title: "Vendor Meeting",
      description: "",
      meetingType: "VENDOR",
      organizerId: admin._id,
      createdBy: admin._id,
      participants: [emp._id],
      startTime: new Date(tomorrow.start.getTime() + 10 * 60 * 60 * 1000),
      endTime: new Date(tomorrow.start.getTime() + 11 * 60 * 60 * 1000),
      timezone: "Asia/Kolkata",
      status: "SCHEDULED",
    });
    const code = (await request(app).post("/api/v1/whatsapp/link-code").set(auth(session.accessToken))).body.data.code;
    await ingest("919876500801", `LINK ${code}`, "wamid.link-confirm");
    await ingest("919876500801", "Cancel tomorrow's vendor meeting", "wamid.cancel");
    expect(memory.sent.at(-1)?.message.toLowerCase()).toMatch(/cancel|confirm|want/);
    await ingest("919876500801", "Yes", "wamid.yes");
    const meeting = await Meeting.findOne({ title: "Vendor Meeting" });
    expect(meeting?.status).toBe("CANCELLED");
  });

  it("updates outbound status without treating status webhooks as user messages", async () => {
    const user = await createUser("ADMIN", "admin@example.com", "9876500801");
    await createEmployeeForUser(user, "9876500801");
    const session = await loginAs("admin@example.com");
    const code = (await request(app).post("/api/v1/whatsapp/link-code").set(auth(session.accessToken))).body.data.code;
    await ingest("919876500801", `LINK ${code}`, "wamid.link-status");
    const outboundId = memory.sent.length ? "wamid.out.1" : "";
    await postWebhook(statusPayload("wamid.out.1", "delivered", "919876500801"));
    await processWhatsAppQueue();
    await postWebhook(statusPayload("wamid.out.1", "sent", "919876500801"));
    await processWhatsAppQueue();
    const outbound = await WhatsAppMessage.findOne({ providerMessageId: "wamid.out.1" });
    expect(outbound?.status).toBe("DELIVERED");
    void outboundId;
  });

  it("handles provider 400, 401, 429, 500, and timeout without crashing", async () => {
    memory.failWith = { statusCode: 400, retryable: false };
    memory.failTimes = -1;
    await whatsAppMessagingService.sendTextMessage({
      phoneNumber: "+919876500801",
      message: "hello",
      conversationId: "WACONV-TEST",
      idempotencyKey: "out-400",
    });
    expect(await WhatsAppMessage.findOne({ idempotencyKey: "out-400" })).toMatchObject({ status: "FAILED" });

    memory.failWith = { statusCode: 401, retryable: false };
    memory.failTimes = -1;
    await whatsAppMessagingService.sendTextMessage({
      phoneNumber: "+919876500801",
      message: "hello",
      conversationId: "WACONV-TEST",
      idempotencyKey: "out-401",
    });

    memory.failWith = { statusCode: 429, retryable: true };
    memory.failTimes = 1;
    const before = memory.sent.length;
    await whatsAppMessagingService.sendTextMessage({
      phoneNumber: "+919876500801",
      message: "retry me",
      conversationId: "WACONV-TEST",
      idempotencyKey: "out-429",
    });
    expect(memory.sent.length).toBeGreaterThan(before);

    memory.failWith = { statusCode: 500, retryable: false };
    memory.failTimes = -1;
    await whatsAppMessagingService.sendTextMessage({
      phoneNumber: "+919876500801",
      message: "boom",
      conversationId: "WACONV-TEST",
      idempotencyKey: "out-500",
    });

    memory.failWith = { statusCode: 504, retryable: false };
    memory.failTimes = -1;
    await whatsAppMessagingService.sendTextMessage({
      phoneNumber: "+919876500801",
      message: "timeout",
      conversationId: "WACONV-TEST",
      idempotencyKey: "out-timeout",
    });
  });

  it("requires JWT for linking APIs", async () => {
    const response = await request(app).post("/api/v1/whatsapp/link-code");
    expect(response.status).toBe(401);
  });
});
