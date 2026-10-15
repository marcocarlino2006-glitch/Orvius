/**
 * Which build is answering: the commit it was built from and the environment
 * it runs in, read from what the host stamped at build time. Null fields mean
 * the host did not say, never a guess.
 */
export type ReleaseIdentity = {
  commit: string | null;
  ref: string | null;
  environment: string;
  deploymentId: string | null;
};

export function releaseIdentity(env: NodeJS.ProcessEnv = process.env): ReleaseIdentity {
  const commit = (env.VERCEL_GIT_COMMIT_SHA || env.SENTRY_RELEASE || env.GIT_COMMIT_SHA || "").trim();
  return {
    commit: /^[0-9a-f]{7,40}$/i.test(commit) ? commit.toLowerCase() : null,
    ref: env.VERCEL_GIT_COMMIT_REF?.trim() || null,
    environment: env.VERCEL_ENV?.trim() || (env.NODE_ENV === "production" ? "production-unknown-host" : env.NODE_ENV || "development"),
    deploymentId: env.VERCEL_DEPLOYMENT_ID?.trim() || null,
  };
}
