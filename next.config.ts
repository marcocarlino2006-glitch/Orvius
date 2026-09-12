import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const nextConfig: NextConfig = {
  // Local/preview uses `next start`. Enable standalone only for Docker builds.
  ...(process.env.ORVIUS_STANDALONE === "1"
    ? { output: "standalone" as const }
    : {}),
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
  disableLogger: true,
});
