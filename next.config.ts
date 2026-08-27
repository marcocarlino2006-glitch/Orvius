import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Local/preview uses `next start`. Enable standalone only for Docker builds.
  ...(process.env.ORVIUS_STANDALONE === "1" ? { output: "standalone" as const } : {}),
};

export default nextConfig;
