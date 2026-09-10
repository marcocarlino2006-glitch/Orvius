#!/usr/bin/env node
/**
 * Remove the rules that nothing can ever match.
 *
 * A selector needs every class it names to exist before it can match, so a
 * selector holding a class no component renders is unreachable — however many
 * live classes sit beside it. Selector lists are pruned entry by entry rather
 * than whole, because `.live, .dead { }` is half alive.
 *
 * Parsed with postcss rather than regex: a stylesheet this size has nested
 * at-rules, and a regex that gets one brace wrong silently deletes a working
 * page. Run with --write to apply; the default is a dry run.
 */
import { readFileSync, writeFileSync } from "node:fs";
import postcss from "postcss";

import { analyzeCssUsage, repoRoot, requiredClasses } from "./lib/css-usage.mjs";

const write = process.argv.includes("--write");
const { cssFiles, dead } = analyzeCssUsage();

let totalRules = 0;
let totalSelectors = 0;
let totalBytes = 0;

for (const file of cssFiles) {
  const before = readFileSync(file, "utf8");
  const root = postcss.parse(before, { from: file });

  let removedRules = 0;
  let removedSelectors = 0;

  root.walkRules((rule) => {
    /* Keyframe steps are percentages, not selectors. */
    if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;

    const live = rule.selectors.filter(
      (selector) => !requiredClasses(selector).some((cls) => dead.has(cls)),
    );

    if (live.length === rule.selectors.length) return;

    if (live.length === 0) {
      removedRules += 1;
      rule.remove();
      return;
    }

    removedSelectors += rule.selectors.length - live.length;
    rule.selectors = live;
  });

  /* An at-rule whose only contents were unreachable is unreachable too. */
  let emptied;
  do {
    emptied = false;
    root.walkAtRules((atRule) => {
      if (atRule.nodes && atRule.nodes.length === 0) {
        atRule.remove();
        emptied = true;
      }
    });
  } while (emptied);

  /*
    Section headers survive their sections. "/* Trust section *\/" above the
    rules that were just deleted now introduces whatever happens to follow it,
    which is worse than no comment at all — it mislabels working code. A
    comment with no rule left between it and the next comment is one of these.
  */
  let orphaned;
  do {
    orphaned = false;
    root.walkComments((comment) => {
      let next = comment.next();
      while (next && next.type === "comment") next = next.next();
      if (!next) {
        comment.remove();
        orphaned = true;
      }
    });
  } while (orphaned);

  const after = root.toString();
  const saved = Buffer.byteLength(before) - Buffer.byteLength(after);

  if (removedRules || removedSelectors) {
    const name = file.replace(`${repoRoot}/`, "");
    console.log(
      `${name}: ${removedRules} rules, ${removedSelectors} extra selectors, ` +
        `${(saved / 1024).toFixed(1)}kb`,
    );
    totalRules += removedRules;
    totalSelectors += removedSelectors;
    totalBytes += saved;
    if (write) writeFileSync(file, after);
  }
}

console.log(
  `\n${dead.size} classes never rendered · ${totalRules} rules and ` +
    `${totalSelectors} selectors removed · ${(totalBytes / 1024).toFixed(1)}kb` +
    (write ? "" : "  (dry run — pass --write to apply)"),
);
