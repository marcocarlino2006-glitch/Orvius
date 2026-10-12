/*
  Enforced: the parts that can't break a page. Report-only: the full policy,
  so violations show up in logs before anything is blocked. Calls in the
  browser go through Vapi, which uses Daily for audio.
*/
export const ENFORCED_CSP = ["object-src 'none'", "base-uri 'self'"].join("; ");

export function reportOnlyCsp(frameAncestors: string) {
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "media-src 'self' blob: https:",
    "font-src 'self' data:",
    "connect-src 'self' https://api.vapi.ai https://*.daily.co wss://*.daily.co https://*.sentry.io https://*.ingest.us.sentry.io",
    "frame-src 'self' https://*.daily.co",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "form-action 'self' https://accounts.google.com https://checkout.stripe.com https://billing.stripe.com",
    `frame-ancestors ${frameAncestors}`,
    "report-uri /api/csp-report",
  ].join("; ");
}
