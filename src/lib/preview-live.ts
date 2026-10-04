/**
 * Previews only answer as the caller's business once the demo number sends
 * its calls to our server. Until then the demo shop picks up, so nothing
 * should invite an owner to "hear your business". Read at build time on static
 * pages: flipping the flag needs a redeploy.
 */
export function isPreviewLive(): boolean {
  return process.env.ORVIUS_PREVIEW_LIVE === "1";
}
