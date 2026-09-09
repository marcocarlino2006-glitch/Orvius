/**
 * Owner-facing product routes, for audits that run with a session.
 *
 * The public list in public-pages.cjs stops at the sign-in wall, which left the
 * surface owners actually use unmeasured. Detail routes need a record to point
 * at, so they are built from the audit fixture rather than hardcoded.
 */
const STATIC = [
  "/dashboard",
  "/dashboard/ask",
  "/dashboard/billing",
  "/dashboard/calls",
  "/dashboard/customers",
  "/dashboard/dispatch",
  "/dashboard/inbox",
  "/dashboard/jobs",
  "/dashboard/pricing",
  "/dashboard/profile",
  "/dashboard/settings",
];

function dashboardPages(fixture) {
  const paths = [...STATIC];
  if (fixture?.callId) paths.push(`/dashboard/calls/${fixture.callId}`);
  if (fixture?.jobId) paths.push(`/dashboard/jobs/${fixture.jobId}`);
  if (fixture?.leadId) paths.push(`/dashboard/inbox/${fixture.leadId}`);
  if (fixture?.customerId) paths.push(`/dashboard/customers/${fixture.customerId}`);
  return paths;
}

module.exports = { STATIC, dashboardPages };
