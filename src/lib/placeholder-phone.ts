/**
 * Detect theater owner phones — placeholders that look provisioned but aren't.
 * Kept out of manus-post so shop wedge readiness can use it without pulling
 * founder Manus gates into every authenticated API closure.
 */

export function isPlaceholderOwnerPhone(phone: string | null | undefined): boolean {
  if (!phone?.trim()) return true;
  const raw = phone.trim();
  const upper = raw.toUpperCase();
  if (/YOUR[_-]?CELL|PLACEHOLDER|CHANGEME|EXAMPLE|XXX+|TODO/i.test(upper)) {
    return true;
  }
  const digits = raw.replace(/\D/g, "");
  if (digits.length < 10) return true;
  // All same digit / obvious fake
  if (/^(\d)\1{9,}$/.test(digits)) return true;
  if (/^1?555555/.test(digits)) return true;
  return false;
}
