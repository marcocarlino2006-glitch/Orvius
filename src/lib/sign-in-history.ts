import { sendSecurityNotice } from "@/lib/account-security";
import { logWarn } from "@/lib/logger";
import { normalizeEmail } from "@/lib/magic-link";
import { prisma } from "@/lib/prisma";

const KEEP_MS = 90 * 24 * 60 * 60 * 1000;

const METHOD: Record<string, string> = {
  google: "Google",
  password: "Password",
  "email-link": "Email link",
  dev: "Dev sign-in",
};

/** "Chrome on iPhone". Order matters: Edge and Samsung say "Chrome", Chrome says "Safari". */
export function deviceLabel(userAgent: string | null | undefined): string {
  const ua = userAgent ?? "";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /SamsungBrowser/.test(ua)
      ? "Samsung Internet"
      : /Firefox|FxiOS/.test(ua)
        ? "Firefox"
        : /Chrome|CriOS/.test(ua)
          ? "Chrome"
          : /Safari/.test(ua)
            ? "Safari"
            : null;
  const os = /iPhone/.test(ua)
    ? "iPhone"
    : /iPad/.test(ua)
      ? "iPad"
      : /Android/.test(ua)
        ? "Android"
        : /CrOS/.test(ua)
          ? "Chromebook"
          : /Mac OS X|Macintosh/.test(ua)
            ? "Mac"
            : /Windows/.test(ua)
              ? "Windows"
              : /Linux/.test(ua)
                ? "Linux"
                : null;
  if (browser && os) return `${browser} on ${os}`;
  return browser ?? os ?? "Unknown device";
}

/** City and region from the edge's geo headers, never the address itself. */
export function placeLabel(headers: Pick<Headers, "get">): string | null {
  const decode = (v: string | null) => {
    if (!v) return null;
    try {
      return decodeURIComponent(v).trim() || null;
    } catch {
      return v.trim() || null;
    }
  };
  const city = decode(headers.get("x-vercel-ip-city"));
  const region = decode(headers.get("x-vercel-ip-country-region"));
  const country = decode(headers.get("x-vercel-ip-country"));
  const parts = [city, region ?? (city ? null : country)].filter(Boolean);
  return parts.length ? parts.join(", ").slice(0, 80) : null;
}

/*
  Records a sign-in and emails the address when the device hasn't signed in
  during the last 90 days. The very first sign-in is not "new": there is
  nothing to compare it with, and the person just made the account.
*/
export async function recordSignIn(params: {
  email: string;
  provider: string;
  userAgent: string | null;
  place: string | null;
  now?: Date;
}): Promise<{ newDevice: boolean }> {
  const email = normalizeEmail(params.email);
  if (!email) return { newDevice: false };
  const now = params.now ?? new Date();
  const since = new Date(now.getTime() - KEEP_MS);
  const device = deviceLabel(params.userAgent);
  const method = METHOD[params.provider] ?? params.provider;

  const seen = await prisma.signInEvent.findMany({
    where: { email, createdAt: { gte: since } },
    select: { device: true },
    take: 200,
  });
  await prisma.signInEvent.create({ data: { email, method, device, place: params.place, createdAt: now } });
  await prisma.signInEvent.deleteMany({ where: { email, createdAt: { lt: since } } });

  const newDevice = seen.length > 0 && !seen.some((s) => s.device === device);
  if (newDevice) {
    await sendSecurityNotice(email, "new_sign_in", {
      now,
      detail: `Device: ${device}${params.place ? `, near ${params.place}` : ""}. Signed in with: ${method}.`,
    });
  }
  return { newDevice };
}

/** Called from the auth callback: a history failure must never stop someone signing in. */
export async function recordSignInSafely(email: string, provider: string): Promise<void> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    await recordSignIn({ email, provider, userAgent: h.get("user-agent"), place: placeLabel(h) });
  } catch (error) {
    logWarn("sign_in_history.record_failed", { error: error instanceof Error ? error.message : String(error) });
  }
}

export async function recentSignIns(rawEmail: string, take = 10) {
  const email = normalizeEmail(rawEmail);
  if (!email) return [];
  return prisma.signInEvent.findMany({
    where: { email },
    orderBy: { createdAt: "desc" },
    take,
    select: { method: true, device: true, place: true, createdAt: true },
  });
}
