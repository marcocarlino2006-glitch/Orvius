/**
 * Every statically routable public page, in one place.
 *
 * Both the contrast and layout audits read this list. They used to carry their
 * own two-entry arrays, which is how a colorway change to shared tokens shipped
 * with the home page clean and seventeen other routes unreadable: the audit
 * scope was narrower than the blast radius of the thing being audited.
 *
 * Token-bearing routes only. Dynamic token URLs (/c/[token]) and redirect stubs
 * (/login) have nothing of their own to measure.
 */
module.exports = [
  "/",
  "/about",
  "/cookies",
  "/demo",
  "/dmca",
  "/domains",
  "/enterprise",
  "/legal",
  "/pilot",
  "/pricing",
  "/privacy",
  "/product",
  "/refunds",
  "/resources",
  "/security",
  "/signin",
  "/sms-terms",
  "/terms",
  "/ui-kit",
];
