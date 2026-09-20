import { env } from "../../config/env";
import { logger } from "../../config/logger";
import {
  type LlmProvider,
  type LlmConversationTurn,
  type LlmUnderstandResult,
  GeminiProvider,
  DisabledLlmProvider,
} from "./gemini.provider";
import { GrokProvider } from "./grok.provider";
import { OpenAIProvider } from "./openai.provider";
import { ZAiProvider } from "./zai.provider";
import { ClaudeProvider } from "./claude.provider";

/**
 * AI Provider Router - Multi-Provider Fallback System
 * 
 * This router automatically tries multiple AI providers in priority order.
 * When one provider fails (rate limit, error, timeout), it automatically
 * switches to the next available provider.
 * 
 * Configuration:
 * - Set API keys in .env for each provider you want to use
 * - Set AI_PROVIDERS_PRIORITY to control fallback order
 * - Set AI_FALLBACK_ENABLED=true to enable auto-fallback
 * 
 * Example .env:
 *   GEMINI_API_KEY=your_key
 *   GROK_API_KEY=your_key
 *   OPENAI_API_KEY=your_key
 *   AI_PROVIDERS_PRIORITY=gemini,grok,openai
 */

export type ProviderName = "gemini" | "grok" | "openai" | "z_ai" | "claude";

export interface ProviderResult<T> {
  data: T | null;
  provider: ProviderName | null;
  fallbackUsed: boolean;
  attempts: Array<{
    provider: ProviderName;
    success: boolean;
    error?: string;
  }>;
}

/**
 * Multi-provider AI router with automatic fallback
 */
export class AiProviderRouter {
  private providers: Map<ProviderName, LlmProvider>;
  private priorityOrder: ProviderName[];
  private fallbackEnabled: boolean;
  private maxRetries: number;

  constructor() {
    this.providers = new Map();
    this.priorityOrder = this.parsePriorityOrder(env.AI_PROVIDERS_PRIORITY);
    this.fallbackEnabled = env.AI_FALLBACK_ENABLED === "true";
    this.maxRetries = env.AI_MAX_RETRIES;

    this.initializeProviders();
    
    logger.info(
      { 
        providers: Array.from(this.providers.keys()),
        priority: this.priorityOrder,
        fallbackEnabled: this.fallbackEnabled,
      },
      "AI Provider Router initialized"
    );
  }

  /**
   * Initialize all configured providers
   */
  private initializeProviders(): void {
    // Always add Gemini (original provider)
    const geminiProvider = new GeminiProvider();
    if (geminiProvider.isEnabled()) {
      this.providers.set("gemini", geminiProvider);
    }

    // Add Grok (xAI)
    const grokProvider = new GrokProvider();
    if (grokProvider.isEnabled()) {
      this.providers.set("grok", grokProvider);
    }

    // Add OpenAI
    const openaiProvider = new OpenAIProvider();
    if (openaiProvider.isEnabled()) {
      this.providers.set("openai", openaiProvider);
    }

    // Add Z AI
    const zaiProvider = new ZAiProvider();
    if (zaiProvider.isEnabled()) {
      this.providers.set("z_ai", zaiProvider);
    }

    // Add Claude
    const claudeProvider = new ClaudeProvider();
    if (claudeProvider.isEnabled()) {
      this.providers.set("claude", claudeProvider);
    }
  }

  /**
   * Parse priority order from environment variable
   */
  private parsePriorityOrder(priorityStr: string): ProviderName[] {
    const validProviders: ProviderName[] = ["gemini", "grok", "openai", "z_ai", "claude"];
    const requested = priorityStr
      .split(",")
      .map((p) => p.trim().toLowerCase())
      .filter((p): p is ProviderName => validProviders.includes(p as ProviderName));
    
    // If no valid providers specified, use default order
    return requested.length > 0 ? requested : ["gemini", "grok", "openai", "z_ai", "claude"];
  }

  /**
   * Get enabled providers in priority order
   */
  private getEnabledProviders(): LlmProvider[] {
    const enabled: Array<{ name: ProviderName; provider: LlmProvider }> = [];
    
    for (const name of this.priorityOrder) {
      const provider = this.providers.get(name);
      if (provider && provider.isEnabled()) {
        enabled.push({ name, provider });
      }
    }

    return enabled.map((e) => e.provider);
  }

  /**
   * Get provider name by instance
   */
  private getProviderName(provider: LlmProvider): ProviderName | null {
    for (const [name, p] of this.providers.entries()) {
      if (p === provider) return name;
    }
    return null;
  }

  /**
   * Execute a function with automatic fallback across providers
   */
  private async executeWithFallback<T>(
    fn: (provider: LlmProvider) => Promise<T | null>,
  ): Promise<ProviderResult<T>> {
    const attempts: ProviderResult<T>["attempts"] = [];
    const enabledProviders = this.getEnabledProviders();
    const providersToTry = this.fallbackEnabled 
      ? enabledProviders.slice(0, this.maxRetries)
      : (enabledProviders.slice(0, 1) as LlmProvider[]);

    if (providersToTry.length === 0) {
      logger.warn("No AI providers enabled");
      return {
        data: null,
        provider: null,
        fallbackUsed: false,
        attempts: [],
      };
    }

    for (const provider of providersToTry) {
      const providerName: ProviderName = this.getProviderName(provider) || "gemini";
      
      try {
        const result = await fn(provider);
        
        if (result !== null) {
          attempts.push({ provider: providerName, success: true });
          
          logger.debug(
            { provider: providerName, attempts: attempts.length },
            `AI request succeeded with ${providerName}`
          );
          
          return {
            data: result,
            provider: providerName,
            fallbackUsed: attempts.length > 1,
            attempts,
          };
        } else {
          attempts.push({ 
            provider: providerName, 
            success: false, 
            error: "Returned null result" 
          });
          logger.warn(
            { provider: providerName },
            `AI provider ${providerName} returned null, trying next...`
          );
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : String(error);
        attempts.push({
          provider: providerName,
          success: false,
          error: errorMsg,
        });
        logger.warn(
          { provider: providerName, err: error },
          `AI provider ${providerName} failed, trying next...`
        );
      }
    }

    // All providers failed
    logger.error(
      { attempts },
      "All AI providers failed"
    );

    return {
      data: null,
      provider: null,
      fallbackUsed: attempts.length > 1,
      attempts,
    };
  }

  /**
   * Understand user intent with fallback
   */
  async understand(input: {
    message: string;
    mode: "query" | "action";
    context: LlmConversationTurn[];
  }): Promise<ProviderResult<LlmUnderstandResult>> {
    return this.executeWithFallback((provider) => provider.understand(input));
  }

  /**
   * Summarize data with fallback
   */
  async summarize(input: {
    message: string;
    intent: string;
    compactData: Record<string, unknown>;
  }): Promise<ProviderResult<string>> {
    return this.executeWithFallback((provider) => provider.summarize(input));
  }

  /**
   * Handle small talk chat with fallback
   */
  async chat(input: { message: string; kind: "smalltalk" }): Promise<ProviderResult<string>> {
    return this.executeWithFallback(async (provider) => {
      if (!provider.chat) return null;
      return provider.chat(input);
    });
  }

  /**
   * Plan query with fallback
   */
  async plan(input: {
    message: string;
    context: LlmConversationTurn[];
    schema?: Record<string, unknown>;
    timezone?: string;
  }): Promise<ProviderResult<Record<string, unknown>>> {
    return this.executeWithFallback((provider) => 
      provider.plan ? provider.plan(input) : Promise.resolve(null)
    );
  }

  /**
   * Check if any provider is available
   */
  hasAvailableProvider(): boolean {
    return this.getEnabledProviders().length > 0;
  }

  /**
   * Get list of enabled provider names
   */
  getEnabledProviderNames(): ProviderName[] {
    return Array.from(this.providers.entries())
      .filter(([, provider]) => provider.isEnabled())
      .map(([name]) => name);
  }

  /**
   * Get router status for debugging
   */
  getStatus(): {
    totalConfigured: number;
    enabledProviders: ProviderName[];
    priorityOrder: ProviderName[];
    fallbackEnabled: boolean;
    maxRetries: number;
  } {
    return {
      totalConfigured: this.providers.size,
      enabledProviders: this.getEnabledProviderNames(),
      priorityOrder: this.priorityOrder,
      fallbackEnabled: this.fallbackEnabled,
      maxRetries: this.maxRetries,
    };
  }
}

// Singleton instance
let routerInstance: AiProviderRouter | null = null;

/**
 * Get or create the AI Provider Router singleton
 */
export function getAiProviderRouter(): AiProviderRouter {
  if (!routerInstance) {
    routerInstance = new AiProviderRouter();
  }
  return routerInstance;
}

/**
 * Reset the router (useful for testing or config changes)
 */
export function resetAiProviderRouter(): void {
  routerInstance = null;
}

/**
 * Legacy compatibility: Get LlmProvider (now uses router internally)
 * 
 * This maintains backward compatibility with existing code that calls
 * getLlmProvider() while adding multi-provider fallback support.
 */
export function getLlmProviderWithFallback(): LlmProvider {
  const router = getAiProviderRouter();
  
  // If no providers available, return disabled provider
  if (!router.hasAvailableProvider()) {
    return new DisabledLlmProvider();
  }

  // Return a wrapper that uses the router
  const routerBasedProvider: LlmProvider = {
    isEnabled: () => router.hasAvailableProvider(),
    
    understand: async (input) => {
      const result = await router.understand(input);
      return result.data;
    },
    
    summarize: async (input) => {
      const result = await router.summarize(input);
      return result.data;
    },
    
    chat: async (input) => {
      const result = await router.chat(input);
      return result.data;
    },
    
    plan: async (input) => {
      const result = await router.plan(input);
      return result.data;
    },
  };

  return routerBasedProvider;
}
