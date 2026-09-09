/**
 * Waits for a page to actually be showing its content.
 *
 * A stable element count is not the same as a rendered page. Dashboard routes
 * paint a skeleton first, and a skeleton holds its shape indefinitely — so an
 * audit that settles on "the DOM stopped changing" happily measures loading
 * placeholders and reports the surface clean. Every page whose heading came
 * back missing in the first a11y run was a skeleton caught mid-load.
 *
 * Two kinds of placeholder, and only one of them is disqualifying. A
 * whole-page loader stands in for the entire route, so measuring it measures
 * nothing and the audit should refuse. A panel shimmer sits inside a page that
 * has otherwise rendered its chrome and its content, and some of them never
 * resolve in a dev environment with no upstream credentials — waiting for
 * those to clear would mean never auditing the page at all.
 */
const PAGE_LOADERS = ".onboarding-loading, [data-page-loading='true']";
const PANEL_LOADERS = ".ring1-shimmer, .skeleton, [aria-busy='true']";

async function count(page, selector) {
  return page
    .evaluate((sel) => document.querySelectorAll(sel).length, selector)
    .catch(() => 0);
}

async function waitForSettled(page, { timeoutMs = 20000 } = {}) {
  const deadline = Date.now() + timeoutMs;

  /* Blocking: the route is not on screen yet. */
  while (Date.now() < deadline) {
    if ((await count(page, PAGE_LOADERS)) === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  /* Best effort: give panel shimmers a chance to resolve, but do not insist. */
  const panelDeadline = Math.min(deadline, Date.now() + 6000);
  while (Date.now() < panelDeadline) {
    if ((await count(page, PANEL_LOADERS)) === 0) break;
    await new Promise((r) => setTimeout(r, 250));
  }

  let stable = 0;
  let last = -1;
  while (Date.now() < deadline && stable < 3) {
    await new Promise((r) => setTimeout(r, 200));
    const n = await page
      .evaluate(() => document.querySelectorAll("body *").length)
      .catch(() => last);
    stable = n === last ? stable + 1 : 0;
    last = n;
  }

  return (await count(page, PAGE_LOADERS)) === 0;
}

module.exports = { waitForSettled, PAGE_LOADERS, PANEL_LOADERS };
