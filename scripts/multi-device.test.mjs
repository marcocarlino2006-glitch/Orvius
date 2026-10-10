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
