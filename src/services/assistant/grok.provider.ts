import { env } from "../../config/env";
import { logger } from "../../config/logger";
import {
  type LlmProvider,
  type LlmConversationTurn,
  type LlmUnderstandResult,
} from "./gemini.provider";

/**
 * Grok (xAI) Provider Implementation
 * 
 * Implements the LlmProvider interface for xAI's Grok models.
 * API Docs: https://docs.x.ai/docs
 */
export class GrokProvider implements LlmProvider {
  readonly providerName = "grok";

  isEnabled(): boolean {
    return Boolean(env.GROK_API_KEY);
  }

  async understand(input: {
    message: string;
    mode: "query" | "action";
    context: LlmConversationTurn[];
  }): Promise<LlmUnderstandResult | null> {
    const raw = await this.generate(this.buildUnderstandPrompt(input), {
      maxTokens: 512,
      temperature: 0,
    });
    if (!raw) return null;
    
    return this.parseUnderstandResult(raw);
  }

  async summarize(input: {
    message: string;
    intent: string;
    compactData: Record<string, unknown>;
  }): Promise<string | null> {
    const text = await this.generate(this.buildSummarizePrompt(input), {
      maxTokens: 256,
      temperature: 0.3,
    });
    if (!text) return null;
    
    return text.replace(/^```(?:json)?|```$/g, "").trim().slice(0, 1000) || null;
  }

  async chat(input: { message: string; kind: "smalltalk" }): Promise<string | null> {
    const text = await this.generate(this.buildSmallTalkPrompt(input.message), {
      maxTokens: 256,
      temperature: 0.7,
    });
    if (!text) return null;
    
    return text.replace(/^```(?:json)?|```$/g, "").trim().slice(0, 500) || null;
  }

  async plan?(input: {
    message: string;
    context: LlmConversationTurn[];
    schema?: Record<string, unknown>;
    timezone?: string;
  }): Promise<Record<string, unknown> | null> {
    const raw = await this.generate(this.buildPlanPrompt(input), {
      maxTokens: 700,
      temperature: 0,
    });
    if (!raw) return null;
    
    return this.parseJsonObject(raw);
  }

  private async generate(
    prompt: string,
    options: { maxTokens: number; temperature: number },
  ): Promise<string | null> {
    if (!env.GROK_API_KEY) return null;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), env.GROK_TIMEOUT_MS);

    try {
      const response = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        signal: controller.signal,
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${env.GROK_API_KEY}`,
        },
        body: JSON.stringify({
          model: env.GROK_MODEL,
          messages: [
            {
              role: "system",
              content: "You are an AI assistant for business management. Respond in English only.",
            },
            {
              role: "user",
              content: prompt,
            },
          ],
          max_tokens: options.maxTokens,
          temperature: options.temperature,
          response_format: options.temperature === 0 ? { type: "json_object" } : undefined,
        }),
      });

      if (response.status === 429) {
        logger.warn({ status: 429, provider: "grok" }, "Grok rate limited");
        return null;
      }

      if (!response.ok) {
        logger.warn({ status: response.status, provider: "grok" }, "Grok request failed");
        return null;
      }

      const body = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      
      return body.choices?.[0]?.message?.content?.trim() || null;
    } catch (error) {
      logger.warn({ err: error, provider: "grok" }, "Grok unavailable");
      return null;
    } finally {
      clearTimeout(timer);
    }
  }

  private buildUnderstandPrompt(input: {
    message: string;
    mode: "query" | "action";
    context: LlmConversationTurn[];
  }): string {
    const history = input.context
      .slice(-5)
      .map((turn) => `${turn.role}: ${turn.text.slice(0, 200)}`)
      .join("\n");

    return [
      "You are an intent classifier for an office management API.",
      "Return JSON only. Never access databases.",
      "Messages may mix English and Tamil (Tanglish). Interpret meaning.",
      'JSON shape: {"kind":"query"|"action","intent":"TODAY_TASKS","english":"What tasks are assigned?","entities":{},"confidence":0.9}',
      history ? `Recent conversation:\n${history}` : "",
      `User message:\n${input.message}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private buildSummarizePrompt(input: {
    message: string;
    intent: string;
    compactData: Record<string, unknown>;
  }): string {
    return [
      "Write a short spoken answer for an MD / Chief of Staff in English.",
      "Use ONLY the provided JSON facts. Do not invent data.",
      `Intent: ${input.intent}`,
      `Question: ${input.message}`,
      `Facts JSON: ${JSON.stringify(input.compactData).slice(0, 4000)}`,
    ].join("\n");
  }

  private buildSmallTalkPrompt(message: string): string {
    return [
      "You are a friendly MD office assistant. Reply in English only.",
      "Reply in 1-3 short sentences.",
      "Invite them to ask about projects, tasks, or meetings.",
      `User message:\n${message}`,
    ].join("\n");
  }

  private buildPlanPrompt(input: {
    message: string;
    context: LlmConversationTurn[];
    schema?: Record<string, unknown>;
    timezone?: string;
  }): string {
    const history = input.context
      .slice(-5)
      .map((turn) => `${turn.role}: ${turn.text.slice(0, 200)}`)
      .join("\n");

    return [
      "You are a business query planner. Return JSON only.",
      "If not about business data, return {\"unsupported\":true}.",
      `Timezone: ${input.timezone ?? "Asia/Kolkata"}`,
      `Schema JSON: ${JSON.stringify(input.schema ?? {}).slice(0, 6000)}`,
      'JSON shape: {"type":"QUERY","operation":"LIST","sources":["projects"],"filters":[],"relationships":[],"groupBy":[],"sort":[],"limit":20}',
      history ? `Recent conversation:\n${history}` : "",
      `User message:\n${input.message}`,
    ]
      .filter(Boolean)
      .join("\n");
  }

  private parseUnderstandResult(raw: string): LlmUnderstandResult | null {
    const parsed = this.parseJsonObject(raw);
    if (!parsed) return null;

    const kind = parsed.kind === "action" || parsed.kind === "query" ? parsed.kind : "query";
    const intent = String(parsed.intent ?? "").toUpperCase().replace(/[^A-Z0-9_]/g, "") || null;
    const confidence = Number(parsed.confidence);
    const english = typeof parsed.english === "string" 
      ? parsed.english.replace(/[$\{\}]/g, "").trim().slice(0, 200) 
      : "";

    if (!intent) return null;

    return {
      kind,
      intent,
      entities: (typeof parsed.entities === "object" && parsed.entities) 
        ? parsed.entities as Record<string, unknown> 
        : {},
      confidence: Number.isFinite(confidence) ? Math.min(1, Math.max(0, confidence)) : 0.8,
      english: english || undefined,
    };
  }

  private parseJsonObject(text: string): Record<string, unknown> | null {
    const trimmed = text.trim();
    const start = trimmed.indexOf("{");
    const end = trimmed.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    
    try {
      const parsed = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
}
