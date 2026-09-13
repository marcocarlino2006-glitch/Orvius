#!/usr/bin/env node
/**
 * Deletes the CSS that `npm run css:audit` reports as never rendered.
 *
 * Pruning this by hand is how you eat a closing brace: the dead rules are
 * scattered through two files of several thousand lines, most of them nested
 * inside media queries and written as comma lists that mix a dead selector with
 * a live one. So it goes through a real parser. A comma part is dropped when any
 * class in it is on the unused list — a rule that can never match is not worth
 * keeping — and the whole rule goes when nothing is left of its selector.
 *
 * Usage: node scripts/css-prune-dead.mjs [--dry]
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";

const DRY = process.argv.includes("--dry");
const FILES = ["src/app/globals.css", "src/app/dashboard/dashboard.css"];

const report = execFileSync("node", ["scripts/css-usage.mjs"], {
  encoding: "utf8",
});
const dead = new Set(
  [...report.matchAll(/UNUSED\s+\.([A-Za-z0-9_-]+)/g)].map((m) => m[1]),
);

if (!dead.size) {
  console.log("Nothing to prune — no unused classes reported.");
  process.exit(0);
}
console.log(`${dead.size} unused class(es) reported`);

let removed = 0;
let trimmed = 0;

for (const file of FILES) {
  const root = postcss.parse(readFileSync(file, "utf8"), { from: file });

  root.walkRules((rule) => {
    /* Keyframe steps ("0%", "from") are selectors too, and have no classes. */
    if (rule.parent?.type === "atrule" && /keyframes/.test(rule.parent.name)) {
      return;
    }

    const live = rule.selectors.filter((selector) => {
      const classes = [...selector.matchAll(/\.([A-Za-z0-9_-]+)/g)].map(
        (m) => m[1],
      );
      return !classes.some((name) => dead.has(name));
    });

    if (live.length === rule.selectors.length) return;

    if (!live.length) {
      removed++;
      /* Take the comment written to explain the rule with it. */
      const before = rule.prev();
      if (before?.type === "comment") before.remove();
      rule.remove();
      return;
    }

    trimmed++;
    rule.selectors = live;
  });

  /* A media query whose only contents were dead rules is now an empty shell. */
  let emptied = 0;
  root.walkAtRules((at) => {
    if (at.nodes && at.nodes.length === 0) {
      const before = at.prev();
      if (before?.type === "comment") before.remove();
      at.remove();
      emptied++;
    }
  });

  const out = root.toString();
  if (!DRY) writeFileSync(file, out);
  console.log(`${file}: ${emptied} empty at-rule(s) dropped`);
}

console.log(
  `${removed} rule(s) removed, ${trimmed} selector list(s) trimmed${DRY ? " (dry run)" : ""}`,
);
