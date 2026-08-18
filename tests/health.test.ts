import request from "supertest";
import { createApp } from "../src/app";

describe("Phase 1 health", () => {
  const app = createApp();

  it("GET /api/v1/health returns a standard success payload", async () => {
    const response = await request(app).get("/api/v1/health");

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toBe("API is healthy");
    expect(response.body.data.timestamp).toBeDefined();
  });

  it("GET /api/v1/health/database reports disconnected when Mongo is not connected", async () => {
    const response = await request(app).get("/api/v1/health/database");

    expect(response.status).toBe(503);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toBe("Database is not connected");
  });

  it("unknown routes return a standard 404 error payload", async () => {
    const response = await request(app).get("/api/v1/does-not-exist");

    expect(response.status).toBe(404);
    expect(response.body.success).toBe(false);
    expect(response.body.message).toMatch(/Route not found/);
  });
});
