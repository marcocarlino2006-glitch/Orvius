/**
 * Which CSS classes nothing renders.
 *
 * Deleting a rule because grep found no match is how a dynamically built
 * class name gets removed: `attention-item-critical` is never written down
 * anywhere, it is assembled as `attention-item-${item.impact}`. So a class is
 * only reported as dead when it appears nowhere literally AND no template
 * literal in the codebase builds a name that could become it.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

export function walk(dir, exts, out = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(full))) out.push(full);
  }
  return out;
}

/*
  Comments are stripped before anything is counted. A class named in prose
  renders nothing, and this file's own explanation of `attention-item-critical`
  was enough to make the audit call it used. Line comments are only recognised
  at the start of a line so a URL in the middle of one does not swallow the
  className beside it.
*/
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

export function analyzeCssUsage() {
  const cssFiles = walk(join(repoRoot, "src"), [".css"]);
  const codeFiles = [
    ...walk(join(repoRoot, "src"), [".tsx", ".ts", ".jsx", ".js"]),
    ...walk(join(repoRoot, "scripts"), [".mjs", ".cjs", ".js"]),
  ].filter((f) => !f.includes("css-usage") && !f.includes("css-prune"));

  const codeText = codeFiles
    .map((f) => stripComments(readFileSync(f, "utf8")))
    .join("\n");

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

  /* Every literal prefix that sits immediately before an interpolation, so
     `pro-rail-status-${tone}` protects pro-rail-status-warn and its siblings. */
  const dynamicPrefixes = new Set();
  for (const match of codeText.matchAll(/([A-Za-z][\w-]*-)\$\{/g)) {
    dynamicPrefixes.add(match[1]);
  }

  const literal = new Set();
  for (const match of codeText.matchAll(/[A-Za-z][\w-]*/g)) literal.add(match[0]);

  const verdicts = new Map();
  for (const [name, files] of declared) {
    const dynamicPrefix = [...dynamicPrefixes].find(
      (p) => name.startsWith(p) && name !== p,
    );
    verdicts.set(name, {
      name,
      files: [...files],
      verdict: literal.has(name) ? "used" : dynamicPrefix ? "dynamic" : "dead",
      dynamicPrefix: dynamicPrefix ?? null,
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
