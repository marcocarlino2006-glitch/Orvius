/**
 * Whether the serving deployment is the approved release. Compares what the
 * deployment reports about itself with EXPECTED_COMMIT; never the runner's
 * checkout or a version string in the repo.
 */
export function releaseCheck(release, expectedRaw) {
  const expected = expectedRaw?.trim().toLowerCase() || null;
  if (!expected || !/^[0-9a-f]{40}$/.test(expected)) {
    return { ok: false, detail: "EXPECTED_COMMIT must name the full 40-character commit of the promoted release; without it nothing says which build should be serving" };
  }
  const served = typeof release?.commit === "string" ? release.commit.toLowerCase() : null;
  if (!served) return { ok: false, detail: "the deployment does not name the commit it was built from" };
  if (served !== expected) return { ok: false, detail: `the deployment serves ${served.slice(0, 12)}, expected ${expected.slice(0, 12)}` };
  return { ok: true, detail: `${served.slice(0, 12)} (${release.environment}${release.deploymentId ? `, ${release.deploymentId}` : ""}) matches EXPECTED_COMMIT` };
}
