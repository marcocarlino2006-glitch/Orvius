/**
 * Ask production whether the call line is actually live.
 * Local agent `.env` emptiness must not paint "paste Twilio" when Vercel already answers.
 */

const DEFAULT_HEALTH =
  process.env.PROD_HEALTH_URL?.trim() ||
  process.env.ORVIUS_PROD_HEALTH_URL?.trim() ||
  "https://api.orvius.im/api/health";

export type ProdTelephonyProbe = {
  ok: boolean;
  phone: string | null;
  ownerSmsEnabled: boolean;
  source: string;
  error?: string;
};

export async function probeProdTelephony(
  healthUrl = DEFAULT_HEALTH,
): Promise<ProdTelephonyProbe> {
  try {
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      return {
        ok: false,
        phone: null,
        ownerSmsEnabled: false,
        source: healthUrl,
        error: `HTTP ${res.status}`,
      };
    }
    const json = (await res.json()) as {
      configured?: boolean;
      twilioPhone?: string | null;
      ownerSmsEnabled?: boolean;
    };
    const phone =
      typeof json.twilioPhone === "string" && json.twilioPhone.trim()
        ? json.twilioPhone.trim()
        : null;
    return {
      ok: Boolean(json.configured && phone),
      phone,
      ownerSmsEnabled: Boolean(json.ownerSmsEnabled),
      source: healthUrl,
    };
  } catch (error) {
    return {
      ok: false,
      phone: null,
      ownerSmsEnabled: false,
      source: healthUrl,
      error: error instanceof Error ? error.message : "probe failed",
    };
  }
}
