import { env } from "../../config/env";
import { MetaWhatsAppProvider } from "./metaWhatsApp.provider";
import type { WhatsAppProvider } from "./whatsappProvider.interface";

const metaProvider = new MetaWhatsAppProvider();

type Registry = { provider: WhatsAppProvider | null };
const registry: Registry = ((globalThis as { __whatsAppProviderRegistry?: Registry }).__whatsAppProviderRegistry ??= {
  provider: null,
});

export function getWhatsAppProvider(): WhatsAppProvider {
  if (registry.provider) return registry.provider;
  if (env.WHATSAPP_PROVIDER === "meta" || !env.WHATSAPP_PROVIDER) return metaProvider;
  return metaProvider;
}

export function setWhatsAppProvider(provider: WhatsAppProvider | null): void {
  registry.provider = provider;
}
