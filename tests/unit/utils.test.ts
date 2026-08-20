import { z } from "zod";
import { isTaskOverdue } from "../../src/repositories/task.repository";
import { computeNextRunAt, normalizeRecurrence } from "../../src/services/reminder/recurrence";
import { sanitizeWhatsAppText, splitWhatsAppText } from "../../src/services/whatsapp/whatsappResponse";
import { rejectMongoOperators } from "../../src/validations/common.validation";
import { PAGINATION } from "../../src/utils/constants";
import { expiresInToDate } from "../../src/utils/generateToken";
import { parsePagination, buildPaginationMeta, escapeRegex } from "../../src/utils/pagination";
import { e164Digits, isValidE164, maskPhone, toE164 } from "../../src/utils/phone";
import { addZonedDays, getZonedDayRange } from "../../src/utils/timezone";

describe("parsePagination", () => {
  it("defaults to page 1 and the configured limit", () => {
    expect(parsePagination({})).toEqual({
      page: PAGINATION.defaultPage,
      limit: PAGINATION.defaultLimit,
      skip: 0,
    });
  });

  it("caps limit at the maximum and never returns an unbounded page", () => {
    const result = parsePagination({ page: 2, limit: 10_000 });
    expect(result.limit).toBe(PAGINATION.maxLimit);
    expect(result.page).toBe(2);
    expect(result.skip).toBe(PAGINATION.maxLimit);
  });

  it("falls back when page or limit is invalid", () => {
    expect(parsePagination({ page: 0, limit: -5 })).toMatchObject({
      page: PAGINATION.defaultPage,
      limit: PAGINATION.defaultLimit,
    });
  });

  it("builds pagination metadata without inventing extra pages", () => {
    expect(buildPaginationMeta(1, 20, 0)).toMatchObject({ totalPages: 0, hasNextPage: false });
    expect(buildPaginationMeta(2, 10, 25)).toMatchObject({ totalPages: 3, hasNextPage: true, hasPreviousPage: true });
  });

  it("escapes regex metacharacters and truncates search terms", () => {
    expect(escapeRegex("task.*")).toBe("task\\.\\*");
    expect(escapeRegex("a".repeat(80)).length).toBe(50);
  });
});

describe("phone helpers", () => {
  it("normalizes 10-digit Indian numbers to E.164", () => {
    expect(toE164("9876543210")).toBe("+919876543210");
    expect(e164Digits("+91 98765 43210")).toBe("919876543210");
    expect(isValidE164("+919876543210")).toBe(true);
    expect(maskPhone("9876543210")).toMatch(/^\+91\*+3210$/);
  });

  it("rejects invalid E.164 values", () => {
    expect(isValidE164("9876543210")).toBe(false);
    expect(toE164("")).toBe("");
  });
});

describe("task overdue derivation", () => {
  it("treats open past-due tasks as overdue and completed tasks as not overdue", () => {
    const past = new Date("2020-01-01T00:00:00.000Z");
    expect(isTaskOverdue({ status: "PENDING", dueDate: past })).toBe(true);
    expect(isTaskOverdue({ status: "COMPLETED", dueDate: past })).toBe(false);
    expect(isTaskOverdue({ status: "PENDING", dueDate: null })).toBe(false);
  });
});

describe("reminder recurrence", () => {
  it("disables recurrence when not requested", () => {
    expect(normalizeRecurrence(undefined).enabled).toBe(false);
    expect(computeNextRunAt(new Date(), { enabled: false, frequency: "WEEKLY", interval: 1 }, "Asia/Kolkata")).toBeNull();
  });

  it("advances a weekly reminder by seven Asia/Kolkata days", () => {
    const from = new Date("2026-08-20T04:30:00.000Z");
    const next = computeNextRunAt(from, { enabled: true, frequency: "WEEKLY", interval: 1 }, "Asia/Kolkata");
    expect(next).toBeTruthy();
    expect(next!.getTime()).toBe(addZonedDays(from, 7, "Asia/Kolkata").getTime());
  });
});

describe("timezone day bounds", () => {
  it("starts Asia/Kolkata days at 00:00:00 local time", () => {
    const noonUtc = new Date("2026-08-20T06:30:00.000Z");
    const range = getZonedDayRange(noonUtc, "Asia/Kolkata");
    expect(range.start.toISOString()).toBe("2026-08-19T18:30:00.000Z");
    expect(range.end.toISOString()).toBe("2026-08-20T18:30:00.000Z");
  });
});

describe("WhatsApp text sanitization", () => {
  it("redacts JWTs and splits long replies", () => {
    const text = `Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.aaa.bbb ${"word ".repeat(200)}`;
    const chunks = splitWhatsAppText(text, 80);
    expect(chunks.join(" ")).not.toMatch(/eyJ/);
    expect(chunks.length).toBeGreaterThan(1);
    expect(sanitizeWhatsAppText("MongoError boom\nat x (file.ts:1)")).toMatch(/couldn't complete/i);
  });
});

describe("token expiry parsing", () => {
  it("parses JWT duration strings", () => {
    const before = Date.now();
    const expires = expiresInToDate("15m");
    expect(expires.getTime()).toBeGreaterThanOrEqual(before + 14 * 60 * 1000);
    expect(expires.getTime()).toBeLessThanOrEqual(Date.now() + 16 * 60 * 1000);
  });
});

describe("Mongo operator rejection", () => {
  it("flags $ operators on object keys", () => {
    const schema = z.object({ title: z.string() }).strict().superRefine(rejectMongoOperators);
    expect(schema.safeParse({ title: "ok" }).success).toBe(true);
    const poisoned = z
      .object({ title: z.string() })
      .passthrough()
      .superRefine(rejectMongoOperators)
      .safeParse({ title: "x", $gt: 1 });
    expect(poisoned.success).toBe(false);
  });
});
