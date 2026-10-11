import assert from "node:assert/strict";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { test } from "node:test";
import { SIGNUP_HREF } from "../src/lib/signup-href.ts";

const root = new URL("../", import.meta.url).pathname;
const read = (p) => readFileSync(join(root, p), "utf8");

function files(dir, out = []) {
  for (const name of readdirSync(join(root, dir))) {
    const rel = join(dir, name);
    if (statSync(join(root, rel)).isDirectory()) {
      if (!["dashboard", "api", "admin", "ui-kit"].includes(name)) files(rel, out);
    } else if (/\.tsx?$/.test(name)) out.push(rel);
  }
  return out;
}

const publicFiles = [
  ...files("src/app"),
  ...readdirSync(join(root, "src/components"))
    .filter((n) => /^(home|marketing|pricing|public|mkt|legal)/.test(n) && /\.tsx$/.test(n))
    .map((n) => `src/components/${n}`),
  "src/lib/help-center.tsx",
  "src/lib/pricing-faq.ts",
  "src/lib/commercial-terms.ts",
];
const redirects = ["/demo", "/signup", "/docs", "/login"];

/** Does an internal path resolve to a page in src/app, matching [param] folders? */
function resolves(path) {
  if (redirects.includes(path)) return true;
  const parts = path.split("/").filter(Boolean);
  function walk(dir, i) {
    if (i === parts.length) return ["page.tsx", "route.ts", "page.ts"].some((f) => existsSync(join(dir, f)));
    if (existsSync(join(dir, parts[i])) && walk(join(dir, parts[i]), i + 1)) return true;
    if (!existsSync(dir)) return false;
    return readdirSync(dir).some((d) => /^\[[^.]+\]$/.test(d) && walk(join(dir, d), i + 1));
  }
  return walk(join(root, "src/app"), 0) || /\.(png|jpg|webp|svg|ico|xml|txt|js)$/.test(path);
}

test("no public link leads nowhere", () => {
  const dead = [];
  for (const f of publicFiles) {
    for (const m of read(f).matchAll(/href=(?:"|\{")(\/[^"#?{}]*)/g)) {
      const path = m[1].replace(/\/$/, "") || "/";
      if (path.startsWith("/api/") || path.startsWith("/dashboard")) continue;
      if (!resolves(path)) dead.push(`${relative(root, join(root, f))} → ${path}`);
    }
  }
  assert.deepEqual(dead, []);
});

test("every start button lands in the same setup flow", () => {
  assert.equal(SIGNUP_HREF, "/signin?mode=signup&callbackUrl=%2Fdashboard%2Fonboarding");
  for (const f of ["src/components/home-line-hero.tsx", "src/app/try/page.tsx", "src/app/about/page.tsx", "src/components/public-demo.tsx", "src/app/r/[code]/page.tsx"]) {
    const src = read(f);
    assert.match(src, /href=\{SIGNUP_HREF\}/, f);
    assert.doesNotMatch(src, /href="\/signin\?mode=signup"|href="\/signup/, f);
  }
});

test("the homepage tells the whole loop, through getting paid", () => {
  const home = read("src/components/home-features.tsx");
  for (const step of [/receptionist brings in the work/, /Command schedules it/, /bill goes out by text/, /paid only once the money arrives/, /on the record/]) {
    assert.match(home, step);
  }
});

test("examples are labelled and nothing public overclaims", () => {
  assert.match(read("src/components/home-demos.tsx"), /Example business, not a customer/);
  const banned = /fully autonomous|never miss(es)? a|guaranteed? (more|results|jobs|revenue|bookings)|100% (of calls|answer|uptime)|trusted by \d|thousands of (shops|businesses)|\breplaces? your (office|staff|team)\b/i;
  /* The pilot's "what we won't promise" list names these claims in order to refuse them. */
  const refuses = new Set(["src/app/pilot/forward/page.tsx"]);
  const hits = publicFiles.filter((f) => !refuses.has(f)).filter((f) => banned.test(read(f).replace(/doesNotMatch\([^)]*\)/g, "")));
  assert.deepEqual(hits, []);
});

test("what the pilot page says Orvius won't do matches what Pricing says it works with", () => {
  const pilot = read("src/app/pilot/forward/page.tsx");
  assert.match(read("src/lib/commercial-terms.ts"), /Jobber/);
  assert.doesNotMatch(pilot, /<li>Sync Jobber/);
  assert.match(pilot, /Jobber and Housecall Pro are supported/);
  assert.doesNotMatch(pilot, /<li>Quote prices,/);
});
