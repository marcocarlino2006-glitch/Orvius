import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { ENFORCED_CSP, reportOnlyCsp } from "./src/lib/csp";

const nextConfig: NextConfig = {
  // Local/preview uses `next start`. Enable standalone only for Docker builds.
  ...(process.env.ORVIUS_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
  async redirects() {
    return [
      { source: "/demo", destination: "/product", permanent: true },
      // Trades Orvius no longer advertises until each has its own tested playbook.
      { source: "/for/:trade(roofing|garage-doors|pest-control|locksmith|appliance-repair)", destination: "/", permanent: true },
    ];
  },
  // Browsers, iOS and link unfurlers ask for these fixed paths without reading the page's icon tags.
  async rewrites() {
    return [
      { source: "/favicon.ico", destination: "/icon" },
      { source: "/apple-touch-icon.png", destination: "/apple-icon" },
      { source: "/apple-touch-icon-precomposed.png", destination: "/apple-icon" },
    ];
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
        ],
      },
      {
        // The web chat (/w) and booking (/b) pages are built to sit inside a shop's own website.
        source: "/((?!w/|b/).*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: `${ENFORCED_CSP}; frame-ancestors 'none'` },
          { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp("'none'") },
        ],
      },
      // Talk-in-the-browser demo pages need the microphone; the last matching header wins.
      ...["/", "/(try|launch|h)"].map((source) => ({
        source,
        headers: [{ key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=(), interest-cohort=()" }],
      })),
      {
        source: "/(w|b)/:path*",
        headers: [
          { key: "Content-Security-Policy", value: `${ENFORCED_CSP}; frame-ancestors *` },
          { key: "Content-Security-Policy-Report-Only", value: reportOnlyCsp("*") },
        ],
      },
    ];
  },
};

const hasSentryAuth = Boolean(process.env.SENTRY_AUTH_TOKEN?.trim());

export default withSentryConfig(nextConfig, {
  silent: true,
  telemetry: false,
  sourcemaps: {
    // Without an auth token, skip upload entirely (local/CI without founder secrets).
    disable: !hasSentryAuth,
  },
  widenClientFileUpload: false,
  webpack: { treeshake: { removeDebugLogging: true } },
});
