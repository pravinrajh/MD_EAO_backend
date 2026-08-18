export function normalizeEmail(value?: string | null): string {
  return (value ?? "").trim().toLowerCase();
}

export function normalizePhone(value?: string | null): string {
  return (value ?? "").replace(/\D/g, "");
}

export function normalizeCompanyName(value?: string | null): string {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}
