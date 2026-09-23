/**
 * Probe live production billing readiness (public checkout shape).
 *
 * Local agent `.env` is often empty while Vercel already has Stripe fully ready.
 * Public GET /api/billing/checkout exposes configured/checkoutReady without leaking
 * which env vars are missing.
 */
import { spawnSync } from "node:child_process";

const DEFAULT_CHECKOUT =
  process.env.PROD_BILLING_URL?.trim() ||
  process.env.ORVIUS_PROD_BILLING_URL?.trim() ||
  "https://api.orvius.im/api/billing/checkout";

function parseCheckout(json, source) {
  return {
    ok: Boolean(json?.configured),
    checkoutReady: Boolean(json?.checkoutReady),
    selfServeAvailable: Boolean(json?.selfServeAvailable),
    source,
  };
}

/**
 * @param {string} [checkoutUrl]
 */
export async function probeProdBilling(checkoutUrl = DEFAULT_CHECKOUT) {
  try {
    const res = await fetch(checkoutUrl, {
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/json" },
    });
    if (!res.ok) {
      return {
        ok: false,
        checkoutReady: false,
        selfServeAvailable: false,
        source: checkoutUrl,
        error: `HTTP ${res.status}`,
      };
    }
    return parseCheckout(await res.json(), checkoutUrl);
  } catch (error) {
    return {
      ok: false,
      checkoutReady: false,
      selfServeAvailable: false,
      source: checkoutUrl,
      error: error instanceof Error ? error.message : "probe failed",
    };
  }
}

export function probeProdBillingSync(checkoutUrl = DEFAULT_CHECKOUT) {
  const curl = spawnSync(
    "curl",
    ["-sS", "--max-time", "12", "-H", "accept: application/json", checkoutUrl],
    { encoding: "utf8" },
  );
  if (curl.status !== 0) {
    return {
      ok: false,
      checkoutReady: false,
      selfServeAvailable: false,
      source: checkoutUrl,
      error: (curl.stderr || "").trim() || "curl failed",
    };
  }
  try {
    return parseCheckout(JSON.parse(curl.stdout || "{}"), checkoutUrl);
  } catch (error) {
    return {
      ok: false,
      checkoutReady: false,
      selfServeAvailable: false,
      source: checkoutUrl,
      error: error instanceof Error ? error.message : "bad JSON",
    };
  }
}
