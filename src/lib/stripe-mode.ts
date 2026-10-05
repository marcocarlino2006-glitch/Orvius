export type StripeKeyMode = "live" | "test" | null;

export function stripeKeyMode(key = process.env.STRIPE_SECRET_KEY): StripeKeyMode {
  const value = key?.trim() ?? "";
  if (/^(sk|rk)_live_/.test(value)) return "live";
  if (/^(sk|rk)_test_/.test(value)) return "test";
  return null;
}

/**
 * The Vercel production deployment only. Preview deploys also build with
 * NODE_ENV=production, and those are where test keys belong.
 */
export function isProductionDeployment(): boolean {
  return process.env.VERCEL_ENV === "production";
}

/**
 * A test key on the production deployment means the public test card counts
 * as paid, and every "paid" checkout buys a real phone number at our cost.
 */
export function isStripeTestModeInProduction(): boolean {
  return isProductionDeployment() && stripeKeyMode() === "test";
}
