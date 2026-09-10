/**
 * Which CSS classes nothing renders.
 *
 * Deleting a rule because grep found no match is how a dynamically built class
 * name gets removed: `attention-item-critical` is never written down anywhere,
 * it is assembled as `attention-item-${item.impact}`. So a class is reported
 * dead only when no rendered module names it literally and no interpolation in
 * a rendered module could build it.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { renderedModules, repoRoot, walk } from "./module-graph.mjs";

export { repoRoot, walk };

/*
  Comments are stripped before anything is counted. A class named in prose
  renders nothing, and this file's own explanation of `attention-item-critical`
  was enough to make the audit call it used. Line comments are only recognised
  at the start of a line so a URL in the middle of one does not swallow the
  className beside it.
*/
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/*
  Only string literals are read, not every identifier in the file. A class name
  reaches the DOM as text, so a bare identifier scan credits any surface that
  happens to have a variable called `card` or `title`.
*/
const stringLiteralRe = /"([^"\\\n]*)"|'([^'\\\n]*)'|`((?:[^`\\]|\\.)*)`/g;
const tokenRe = /[A-Za-z][\w-]*/g;

/** Every class-shaped token written down in a module's string literals. */
function literalTokens(text) {
  const tokens = new Set();
  for (const lit of text.matchAll(stringLiteralRe)) {
    const body = lit[1] ?? lit[2] ?? lit[3] ?? "";
    for (const token of body.matchAll(tokenRe)) tokens.add(token[0]);
  }
  return tokens;
}

/*
  A prefix only protects a name whose remainder is one segment.

  The suffix an interpolation supplies is an enum value — `warn`, `critical`,
  `past_due` — so `attention-item-${impact}` covers attention-item-critical and
  nothing deeper. Protecting every descendant instead let `orvius-${planId}`,
  which is a Stripe product key built in the billing route, vouch for twenty
  `orvius-*` classes that no page has rendered in months.
*/
function protectingPrefix(name, prefixes) {
  for (const prefix of prefixes) {
    if (!name.startsWith(prefix) || name === prefix) continue;
    const remainder = name.slice(prefix.length);
    if (!remainder.includes("-")) return prefix;
  }
  return null;
}

/** Class names each stylesheet declares, mapped to the files declaring them. */
function declaredClasses(cssFiles) {
  const declared = new Map();
  for (const file of cssFiles) {
    const withoutComments = readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const block of withoutComments.split("{")) {
      const selector = block.split("}").pop() ?? "";
      for (const match of selector.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)) {
        if (!declared.has(match[1])) declared.set(match[1], new Set());
        declared.get(match[1]).add(file.replace(`${repoRoot}/`, ""));
      }
    }
  }
  return declared;
}

export function analyzeCssUsage() {
  const cssFiles = walk(join(repoRoot, "src"), [".css"]);

  /*
    The corpus is what a URL can reach, not what src/ contains. Scanning src/
    counted twelve components no route imports, and scanning scripts/ counted
    `ring1-trust-strip` because standard-check.mjs names the file it asserts is
    deleted — a class kept alive by the check proving it should be gone.
  */
  const codeText = [...renderedModules()]
    .map((f) => stripComments(readFileSync(f, "utf8")))
    .join("\n");

  const dynamicPrefixes = new Set();
  for (const match of codeText.matchAll(/([A-Za-z][\w-]*-)\$\{/g)) {
    dynamicPrefixes.add(match[1]);
  }

  const literal = literalTokens(codeText);
  const declared = declaredClasses(cssFiles);

  const verdicts = new Map();
  for (const [name, files] of declared) {
    const dynamicPrefix = protectingPrefix(name, dynamicPrefixes);
    verdicts.set(name, {
      name,
      files: [...files],
      verdict: literal.has(name) ? "used" : dynamicPrefix ? "dynamic" : "dead",
      dynamicPrefix,
    });
  }

  return {
    cssFiles,
    verdicts,
    dynamicPrefixes,
    dead: new Set([...verdicts.values()].filter((v) => v.verdict === "dead").map((v) => v.name)),
  };
}

/**
 * The classes a selector needs to exist before it can ever match.
 *
 * Anything inside :not() is excluded — a class that never appears makes a
 * :not() more likely to match, not less, so treating it as dead would delete
 * a rule that is doing work.
 */
export function requiredClasses(selector) {
  const withoutNegations = selector.replace(/:not\([^)]*\)/g, "");
  return [...withoutNegations.matchAll(/\.(-?[A-Za-z_][\w-]*)/g)].map((m) => m[1]);
}
