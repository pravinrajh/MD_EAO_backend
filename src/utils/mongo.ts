export function isDuplicateKey(error: unknown, field?: string): boolean {
  if (typeof error !== "object" || error === null || !("code" in error) || (error as { code?: number }).code !== 11000) {
    return false;
  }
  if (!field) return true;
  const keyPattern = (error as { keyPattern?: Record<string, number> }).keyPattern;
  const keyValue = (error as { keyValue?: Record<string, unknown> }).keyValue;
  return Boolean(keyPattern?.[field] || keyValue?.[field]);
}
