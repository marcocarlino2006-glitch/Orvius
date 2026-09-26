import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const { CARRIERS, forwardDialCode, getCarrier, buildForwardGuideSms } = await import("../src/lib/carrier-forward.ts");

test("forward dial codes are complete strings for each carrier", () => {
  assert.equal(forwardDialCode(getCarrier("verizon"), "+1 (844) 643-9170"), "*718446439170");
  assert.equal(forwardDialCode(getCarrier("att"), "+18446439170"), "**004*18446439170#");
  assert.equal(forwardDialCode(getCarrier("tmobile"), "844-643-9170"), "**004*18446439170#");
  assert.equal(forwardDialCode(getCarrier("other"), "+18446439170"), null);
  assert.equal(forwardDialCode(getCarrier("att"), "12345"), null);
  const sms = buildForwardGuideSms({ shopName: "Summit HVAC", orviusLine: "+18446439170", mode: "forward", carrier: "att" });
  assert.match(sms, /dial \*\*004\*18446439170# from your cell/);
  assert.ok(CARRIERS.every((c) => c.steps.length >= 3));
});

test("every help link points at a page that exists", () => {
  const source = readFileSync(new URL("../src/lib/help-center.tsx", import.meta.url), "utf8");
  const slugs = [...source.matchAll(/slug: "([a-z0-9-]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(slugs).size, slugs.length, "duplicate help slug");
  for (const [, href] of source.matchAll(/href="(\/[a-z0-9/-]*)"/g)) {
    if (href.startsWith("/help/")) {
      assert.ok(slugs.includes(href.slice(6)), `missing help article ${href}`);
    } else {
      const page = new URL(`../src/app${href}/page.tsx`, import.meta.url);
      assert.ok(existsSync(page), `missing page ${href}`);
    }
  }
});
