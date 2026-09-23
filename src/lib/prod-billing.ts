/**
 * Ask production whether Stripe SaaS is configured.
 * Local empty `.env` must not paint "paste Stripe" when checkout reports configured:true.
 */

const DEFAULT_CHECKOUT =
  process.env.PROD_BILLING_URL?.trim() ||
  process.env.ORVIUS_PROD_BILLING_URL?.trim() ||
  "https://api.orvius.im/api/billing/checkout";

export type ProdBillingProbe = {
  ok: boolean;
  checkoutReady: boolean;
  selfServeAvailable: boolean;
  source: string;
  error?: string;
};

export async function probeProdBilling(
  checkoutUrl = DEFAULT_CHECKOUT,
): Promise<ProdBillingProbe> {
  try {
    const res = await fetch(checkoutUrl, {
      signal: AbortSignal.timeout(12_000),
      headers: { accept: "application/json" },
      cache: "no-store",
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
    const json = (await res.json()) as {
      configured?: boolean;
      checkoutReady?: boolean;
      selfServeAvailable?: boolean;
    };
    return {
      ok: Boolean(json.configured),
      checkoutReady: Boolean(json.checkoutReady),
      selfServeAvailable: Boolean(json.selfServeAvailable),
      source: checkoutUrl,
    };
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
