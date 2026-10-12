const FALLBACK = "/dashboard";

/**
 * Where to send someone after sign-in. Only a path on this site is allowed:
 * a full URL is a phishing redirect and a `javascript:` value runs script on
 * our origin with the owner signed in. Anything else lands on the dashboard.
 */
export function safeCallbackUrl(raw: string | string[] | null | undefined): string {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return FALLBACK;
  const trimmed = value.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//") || trimmed.startsWith("/\\")) return FALLBACK;
  // Control characters and backslashes let browsers reinterpret "/" as a host.
  if (/[\u0000-\u001f\u007f\\]/.test(trimmed)) return FALLBACK;
  try {
    const parsed = new URL(trimmed, "https://orvius.invalid");
    if (parsed.origin !== "https://orvius.invalid") return FALLBACK;
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return FALLBACK;
  }
}
