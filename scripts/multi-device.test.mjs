import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

test("touch screens never zoom on a field and get thumb-sized controls", () => {
  const css = read("src/app/globals.css");
  const touch = css.slice(css.indexOf("@media (pointer: coarse)"));
  assert.ok(touch.length > 0, "a coarse-pointer block exists");
  assert.match(touch, /:not\(#no-zoom\)\s*\{\s*font-size: 16px !important;/);
  assert.match(touch, /\.sc-btn,[\s\S]*min-height: 40px !important;/);
  assert.match(touch, /\.sc-dialog :is\(\.sc-btn[^)]*\)\s*\{\s*min-height: 40px !important;/);
});

test("page content never grows wider than the screen", () => {
  for (const file of ["src/app/dashboard/dashboard.css", "src/app/dashboard/orvius-system.css"]) {
    const css = read(file);
    const widths = [...css.matchAll(/\.os-content-pro > \*\s*\{[^}]*max-width:\s*([^;]+);/g)];
    assert.ok(widths.length > 0, `${file} caps page content`);
    for (const [, value] of widths) {
      assert.match(value, /^min\([^,]+,\s*100%\)/, `${file}: ${value}`);
    }
  }
  const depth = read("src/app/dashboard/orvius-depth.css");
  assert.match(depth, /\.tse-body \{[^}]*minmax\(min\(100%, 17rem\), 1fr\)/);
  assert.match(depth, /\.tse-add \{[^}]*repeat\(2, minmax\(0, 1fr\)\)/);
});

test("trade pages show each part of the scope as its own card", () => {
  const page = read("src/app/for/[trade]/page.tsx");
  assert.match(page, /className="editorial-wrap trade-blocks"/);
  assert.ok((page.match(/className="trade-block( trade-block--muted)?"/g) ?? []).length >= 4);
  assert.match(read("src/app/globals.css"), /\.trade-blocks \{[^}]*minmax\(min\(100%, 22rem\), 1fr\)/);
});

test("pricing buttons line up across plans", () => {
  assert.match(read("src/components/pricing-plan-card.tsx"), /className="tier1-plan-action"/);
  assert.match(read("src/app/globals.css"), /\.tier1-plan > \.tier1-plan-action \{[^}]*margin-top: auto/);
});

test("CI audits every page on phone, iPad and desktop", async () => {
  const ci = read(".github/workflows/perfect-standards.yml");
  assert.match(ci, /run: npm run demo:seed/);
  assert.match(ci, /run: npm run visual:audit -- --base http:\/\/127\.0\.0\.1:3000/);
  assert.equal(JSON.parse(read("package.json")).scripts["visual:audit"], "node scripts/visual-audit.mjs");

  const audit = read("scripts/visual-audit.mjs");
  for (const kind of ["sideways-scroll", "text-off-screen", "fallback-font", "ios-zoom-input"]) {
    assert.match(audit, new RegExp(`kind: "${kind}", blocking: true`), kind);
  }
  const { VIEWPORTS, PUBLIC_PAGES, APP_PAGES } = await import("./visual-audit.mjs");
  assert.deepEqual(VIEWPORTS.map((v) => v.name).sort(), ["desktop", "ipad", "ipad-wide", "phone"]);
  assert.ok(PUBLIC_PAGES.includes("/") && PUBLIC_PAGES.includes("/pricing"));
  assert.ok(APP_PAGES.includes("/dashboard") && APP_PAGES.includes("/dashboard/team"));
});

test("phones keep Sign in in the header and a menu that scrolls instead of overlapping", () => {
  const css = read("src/app/public-polish.css");
  assert.match(css, /\.mkt-nav-actions \.mkt-nav-login:not\(\.mkt-nav-contact\) \{\s*display: inline-flex !important;/);
  assert.match(css, /\.mkt-nav-sheet \{[^}]*overflow-y: auto !important;/);
  assert.match(css, /\.mkt-nav-sheet-nav \{\s*flex: none !important;/);
  const nav = read("src/components/premium-nav.tsx");
  const sheet = nav.slice(nav.indexOf('className="mkt-nav-sheet-nav"'), nav.indexOf('className="mkt-nav-sheet-foot"'));
  assert.doesNotMatch(sheet, /tel:/, "the call button lives once, in the menu footer");
});

test("settings pop-up: one-line rail names, keyword search, readable on both themes, phone forms wrap", async () => {
  const { SETTINGS_SECTIONS, settingsNavLabel } = await import("../src/lib/settings-center.ts");
  for (const section of SETTINGS_SECTIONS) {
    assert.ok(settingsNavLabel(section).length <= 20, `rail name "${settingsNavLabel(section)}" wraps at 232px`);
  }
  const center = read("src/components/settings-center/settings-center.tsx");
  assert.match(center, /searchSettings\(query\)/, "the rail search uses the keyword index");
  assert.match(center, /className="sc-nav-empty"/);
  assert.match(center, /\{current\.label\}/, "the page title keeps the full name");

  const css = read("src/app/dashboard/settings-center.css");
  assert.match(css, /grid-template-columns: 232px minmax\(0, 1fr\);/);
  assert.match(css, /html body \.os-shell \.sc-dialog \{\s*grid-template-columns: minmax\(0, 1fr\);/, "phones get one column");
  assert.match(css, /\.sc-inline-field > select\.sc-input \{\s*flex: 1 1 0 !important;/);
  assert.match(css, /\.sc-connector \{\s*display: grid;/);
  assert.match(css, /html\[data-theme="day"\] \.os-shell \.sc-dialog \.sc-nav-item\.is-active/);

  const globals = read("src/app/globals.css");
  assert.match(globals, /\.os-shell-night \.pro-economics-grid dd \{[^}]*color: var\(--ox-text/, "performance numbers follow the theme");
  assert.match(globals, /\.os-shell-night \.pro-economics-notes strong \{[^}]*color: var\(--ox-text/);
});
