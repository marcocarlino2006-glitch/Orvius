import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  // Local/preview uses `next start`. Enable standalone only for Docker builds.
  ...(process.env.ORVIUS_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), interest-cohort=()" },
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
