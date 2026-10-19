/*
 * Public-page craft that a stylesheet audit can't see: the translation pass
 * used to replace each label's whole content, which deleted the caret on the
 * Product and Resources menus for every visitor, English included. And the
 * small rules that keep equivalent controls the same size and shape.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

globalThis.Node = { TEXT_NODE: 3, ELEMENT_NODE: 1 };
globalThis.document = { createTextNode: (t) => ({ nodeType: 3, textContent: t }) };
const { setLabel } = await import("../src/lib/i18n-label.ts");

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

function el(...nodes) {
  const node = {
    childNodes: nodes,
    get children() {
      return this.childNodes.filter((n) => n.nodeType === 1);
    },
    get textContent() {
      return this.childNodes.map((n) => n.textContent ?? "").join("");
    },
    set textContent(v) {
      this.childNodes = [{ nodeType: 3, textContent: v }];
    },
    prepend(n) {
      this.childNodes.unshift(n);
    },
  };
  return node;
}

test("a translated menu trigger keeps its caret", () => {
  const caret = { nodeType: 1, textContent: "" };
  const trigger = el({ nodeType: 3, textContent: "Product" }, caret);
  setLabel(trigger, "Producto");
  assert.equal(trigger.childNodes.length, 2);
  assert.equal(trigger.childNodes[0].textContent, "Producto");
  assert.equal(trigger.childNodes[1], caret, "the icon is the same node React rendered");
});

test("a plain label is replaced; an icon-only node gains the label in front", () => {
  const plain = el({ nodeType: 3, textContent: "Sign in" });
  setLabel(plain, "Iniciar sesión");
  assert.equal(plain.textContent, "Iniciar sesión");

  const icon = { nodeType: 1, textContent: "" };
  const bare = el(icon);
  setLabel(bare, "Menu");
  assert.equal(bare.childNodes[0].textContent, "Menu");
  assert.equal(bare.childNodes[1], icon);
});

test("the runtime goes through setLabel, never a whole-node text swap", () => {
  const runtime = read("src/components/i18n-runtime.tsx");
  assert.match(runtime, /setLabel\(el, /);
  assert.doesNotMatch(runtime, /el\.textContent\s*=/);
});

test("equivalent controls share one size and shape", () => {
  const v2 = read("src/app/public-v2.css");
  assert.match(v2, /\.tib \.tib-go\.ov-btn \{\s*min-height: 2\.75rem;/, "the browser-call button matches the 44px fields beside it");
  assert.match(v2, /\.ov-public \.tier1-actions \.ov-btn \{[^}]*min-height: 44px !important;[^}]*border-radius: 999px !important;/, "every page's CTA pair is the same button, top or bottom");
  assert.match(read("src/app/globals.css"), /\.mkt-page \.pricing-needs-result \{\s*background: var\(--ov-paper-raised\) !important;\s*border: 1px solid var\(--ov-line\) !important;\s*border-radius: 0\.25rem !important;/, "option cards use the 4px item radius like plan cards and Watch scenarios");
  assert.match(read("src/app/pricing/page.tsx"), /tier1-close tier1-bridge/);
  assert.match(read("src/app/product/page.tsx"), /tier1-story-muted tier1-bridge/);
});

test("Watch opens on a still, truthful state at every width", () => {
  const demo = read("src/components/public-demo.tsx");
  assert.match(demo, /useState<Scenario \| null>\(null\)/, "no call is preselected");
  assert.doesNotMatch(demo, /useEffect/, "nothing starts a call on load");
  assert.doesNotMatch(demo, /on the left/, "the list is above the stage on a phone");
});
