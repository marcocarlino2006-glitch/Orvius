import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFileSync(join(root, path), "utf8");

test("mission-control design system ships graphite + live/focus accents", () => {
  const css = read("src/app/orvius-mission-control.css");
  assert.match(css, /--mc-void:\s*#0a0b0d/);
  assert.match(css, /--mc-live:\s*#2bd576/);
  assert.match(css, /--mc-focus:\s*#5b9cff/);
  assert.match(css, /--mc-attention:\s*#d4a574/);
  assert.match(css, /Orvius Mission Control/);
  assert.doesNotMatch(css, /#e0855a|#b8562c/);
});

test("dashboard layout loads mission-control after dashboard.css", () => {
  const layout = read("src/app/dashboard/layout.tsx");
  const dash = layout.indexOf("./dashboard.css");
  const mc = layout.indexOf("orvius-mission-control.css");
  assert.ok(dash >= 0 && mc > dash);
});

test("product fonts include display + UI + mono voices", () => {
  const layout = read("src/app/layout.tsx");
  assert.match(layout, /Space_Grotesk/);
  assert.match(layout, /IBM_Plex_Sans/);
  assert.match(layout, /IBM_Plex_Mono/);
  assert.match(layout, /--font-display/);
  assert.match(layout, /--font-ui/);
});

test("night OS tokens reject copper agent accent", () => {
  const dash = read("src/app/dashboard/dashboard.css");
  const nightBlock = dash.slice(
    dash.indexOf(".os-shell-night {"),
    dash.indexOf(".os-shell-night {") + 900,
  );
  assert.match(nightBlock, /--os-agent:\s*#5b9cff/);
  assert.match(nightBlock, /--os-paper:\s*#0e0f12/);
  assert.doesNotMatch(nightBlock, /#e0855a/);
});

test("profile menu uses precise chevron, not emoji carets", () => {
  const footer = read("src/components/os-sidebar-footer.tsx");
  assert.match(footer, /<svg/);
  assert.doesNotMatch(footer, /▴|▾/);
});
