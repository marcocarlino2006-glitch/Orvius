/**
 * Probe live production telephony readiness.
 *
 * Agent/local `.env` is often empty even when Vercel already answers calls.
 * Gates that only read process.env then lie: they paint "paste Twilio" as NEXT
 * while api.orvius.im/api/health reports configured:true.
 *
 * Asks production only. Never invents secrets — reads the public readiness
 * shape (/api/health without admin key).
 */
import { spawnSync } from "node:child_process";

const DEFAULT_HEALTH =
  process.env.PROD_HEALTH_URL?.trim() ||
  process.env.ORVIUS_PROD_HEALTH_URL?.trim() ||
  "https://api.orvius.im/api/health";

function parseHealth(json, source) {
  const phone =
    typeof json?.twilioPhone === "string" && json.twilioPhone.trim()
      ? json.twilioPhone.trim()
      : null;
  return {
    ok: Boolean(json?.configured && phone),
    phone,
    ownerSmsEnabled: Boolean(json?.ownerSmsEnabled),
    source,
  };
}

/**
 * @param {string} [healthUrl]
 */
export async function probeProdTelephony(healthUrl = DEFAULT_HEALTH) {
  try {
    const res = await fetch(healthUrl, {
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/json" },
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
    return parseHealth(await res.json(), healthUrl);
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

/** Sync curl fallback for scripts that are not async yet. */
export function probeProdTelephonySync(healthUrl = DEFAULT_HEALTH) {
  const curl = spawnSync(
    "curl",
    ["-sS", "--max-time", "12", "-H", "accept: application/json", healthUrl],
    { encoding: "utf8" },
  );
  if (curl.status !== 0) {
    return {
      ok: false,
      phone: null,
      ownerSmsEnabled: false,
      source: healthUrl,
      error: (curl.stderr || "").trim() || "curl failed",
    };
  }
  try {
    return parseHealth(JSON.parse(curl.stdout || "{}"), healthUrl);
  } catch (error) {
    return {
      ok: false,
      phone: null,
      ownerSmsEnabled: false,
      source: healthUrl,
      error: error instanceof Error ? error.message : "bad JSON",
    };
  }
}
