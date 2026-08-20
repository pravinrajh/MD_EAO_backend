const DEFAULT_COUNTRY = "91";

export function toE164(value?: string | null, defaultCountry = DEFAULT_COUNTRY): string {
  const digits = (value ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.length === 10) return `+${defaultCountry}${digits}`;
  if (digits.length === 11 && digits.startsWith("0")) return `+${defaultCountry}${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith(defaultCountry)) return `+${digits}`;
  if ((value ?? "").trim().startsWith("+")) return `+${digits}`;
  return `+${digits}`;
}

export function e164Digits(value?: string | null): string {
  return toE164(value).replace(/\D/g, "");
}

export function maskPhone(value?: string | null): string {
  const e164 = toE164(value);
  if (e164.length < 8) return "****";
  return `${e164.slice(0, 3)}******${e164.slice(-4)}`;
}

export function isValidE164(value: string): boolean {
  return /^\+[1-9]\d{7,14}$/.test(value);
}
