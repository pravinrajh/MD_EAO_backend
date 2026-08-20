import request from "supertest";
import { createApp } from "../src/app";
import { EXPRESS_ROUTE_INVENTORY, assertMatchesExpressInventory, assertValidOpenApi } from "../src/docs/validate";

const app = createApp();

describe("Swagger / OpenAPI", () => {
  let spec: Record<string, unknown>;

  beforeAll(async () => {
    const response = await request(app).get("/api-docs.json");
    expect(response.status).toBe(200);
    spec = response.body as Record<string, unknown>;
  });

  it("serves Swagger UI", async () => {
    const response = await request(app).get("/api-docs/");
    expect(response.status).toBe(200);
    expect(response.text).toMatch(/swagger/i);
    expect(response.text).toMatch(/AI Executive Office API/);
  });

  it("returns a valid OpenAPI 3 document with resolved refs", () => {
    expect(spec.openapi).toMatch(/^3\./);
    const result = assertValidOpenApi(spec as never);
    assertMatchesExpressInventory(result.operations);
    expect(result.endpointCount).toBe(EXPRESS_ROUTE_INVENTORY.length);
  });

  it("documents Bearer JWT globally and leaves public routes unauthenticated", () => {
    const securitySchemes = (spec.components as { securitySchemes: Record<string, { type: string; scheme?: string }> })
      .securitySchemes;
    expect(securitySchemes.BearerAuth).toMatchObject({ type: "http", scheme: "bearer", bearerFormat: "JWT" });
    expect(spec.security).toEqual([{ BearerAuth: [] }]);

    const paths = spec.paths as Record<string, Record<string, { security?: unknown[] }>>;
    expect(paths["/api/v1/auth/login"].post.security).toEqual([]);
    expect(paths["/api/v1/health"].get.security).toEqual([]);
    expect(paths["/api/v1/webhooks/whatsapp"].get.security).toEqual([]);
    expect(paths["/api/v1/webhooks/whatsapp"].post.security).toEqual([]);
    expect(paths["/api/v1/tasks"].get.security).toEqual([{ BearerAuth: [] }]);
  });

  it("documents WhatsApp webhook verification and signature header without JWT", () => {
    const paths = spec.paths as Record<string, Record<string, { parameters?: Array<{ name: string }>; security?: unknown[] }>>;
    const verify = paths["/api/v1/webhooks/whatsapp"].get;
    const receive = paths["/api/v1/webhooks/whatsapp"].post;
    expect(verify.parameters?.map((item) => item.name)).toEqual(
      expect.arrayContaining(["hub.mode", "hub.verify_token", "hub.challenge"]),
    );
    expect(receive.parameters?.some((item) => item.name === "X-Hub-Signature-256")).toBe(true);
    expect(receive.security).toEqual([]);
  });

  it("does not expose secrets", () => {
    const raw = JSON.stringify(spec);
    expect(raw).not.toMatch(/JWT_SECRET|MONGODB_URI|WHATSAPP_ACCESS_TOKEN|WHATSAPP_APP_SECRET|passwordHash/);
  });

  it("describes Task, Assistant, Reminder, and Notification response contracts", () => {
    const schemas = (spec.components as { schemas: Record<string, { properties?: Record<string, unknown> }> }).schemas;
    expect(schemas.Task.properties).toMatchObject({ taskId: expect.any(Object), title: expect.any(Object), status: expect.any(Object) });
    expect(schemas.Task.properties).not.toHaveProperty("passwordHash");
    expect(schemas.Project.properties).toHaveProperty("budget");
    expect(schemas.Meeting.properties).toHaveProperty("timezone");
    expect(schemas.AssistantQueryResponse.properties).toMatchObject({
      queryId: expect.any(Object),
      intent: expect.any(Object),
      answer: expect.any(Object),
      data: expect.any(Object),
      sources: expect.any(Object),
      confidence: expect.any(Object),
    });
    expect(schemas.AssistantActionResponse.properties).toMatchObject({
      actionId: expect.any(Object),
      requiresConfirmation: expect.any(Object),
      status: expect.any(Object),
    });
    expect(schemas.Reminder.properties).toHaveProperty("scheduledAt");
    expect(schemas.Notification.properties).toMatchObject({ isRead: expect.any(Object), priority: expect.any(Object) });
    expect(schemas.FinanceTransaction.properties?.amount).toMatchObject({ type: "integer" });
  });

  it("lets a public health endpoint succeed without a token", async () => {
    const response = await request(app).get("/api/v1/health");
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
  });

  it("rejects protected APIs without a Bearer token", async () => {
    const response = await request(app).get("/api/v1/tasks");
    expect(response.status).toBe(401);
  });
});
