/**
 * Which surface each CSS class belongs to.
 *
 * A route's stylesheet is decided by what it can reach, not by what sits next
 * to it in the tree. So this walks the import graph out from every page and
 * layout, collects the class names every reachable module mentions, and asks
 * of each declared class which surfaces mention it at all.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { repoRoot, walk } from "./css-usage.mjs";

const SRC = join(repoRoot, "src");

/** Resolve an import specifier to a file on disk, or null if it is a package. */
function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;

  for (const candidate of [
    base,
    `${base}.tsx`,
    `${base}.ts`,
    `${base}.jsx`,
    `${base}.js`,
    join(base, "index.tsx"),
    join(base, "index.ts"),
  ]) {
    if (existsSync(candidate) && !candidate.endsWith("/")) {
      try {
        if (readFileSync(candidate).length >= 0 && /\.(tsx?|jsx?)$/.test(candidate)) {
          return candidate;
        }
      } catch {
        /* directory */
      }
    }
  }
  return null;
}

const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

/** Every module a file can reach, transitively. */
function closure(entry, cache = new Map()) {
  if (cache.has(entry)) return cache.get(entry);
  const seen = new Set();
  cache.set(entry, seen);
  const queue = [entry];
  while (queue.length) {
    const file = queue.pop();
    if (seen.has(file)) continue;
    seen.add(file);
    let text;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const match of text.matchAll(importRe)) {
      const target = resolveImport(match[1], file);
      if (target && !seen.has(target)) queue.push(target);
    }
  }
  return seen;
}

/*
  Layouts wrap every page beneath them, so a class mentioned in a layout
  belongs to each surface under it rather than to the layout's own folder.
*/
function layoutsFor(routeFile) {
  const layouts = [];
  let dir = dirname(routeFile);
  while (dir.startsWith(join(repoRoot, "src/app")) || dir === join(repoRoot, "src/app")) {
    const candidate = join(dir, "layout.tsx");
    if (existsSync(candidate)) layouts.push(candidate);
    if (dir === join(repoRoot, "src/app")) break;
    dir = dirname(dir);
  }
  return layouts;
}

/*
  Only string literals are read, not every identifier in the file. A class name
  reaches the DOM as text, so scanning whole files instead attributes `card` or
  `title` to any surface with a variable of that name — which put 969 rules in
  the shared bucket and made the split look impossible.
*/
const stringLiteralRe = /"([^"\\\n]*)"|'([^'\\\n]*)'|`([^`\\]*)`/g;
const tokenRe = /[A-Za-z][\w-]*/g;

/** Every route entry point: each page, plus the layouts that wrap it. */
export function routeEntries() {
  const pages = walk(join(SRC, "app"), [".tsx"]).filter((f) => f.endsWith("/page.tsx"));
  return pages.map((page) => ({
    page,
    route: page.replace(join(SRC, "app"), "").replace(/\/page\.tsx$/, "") || "/",
    entries: [page, ...layoutsFor(page)],
  }));
}

/**
 * Every module some route can reach.
 *
 * This is the only honest corpus for a "does anything render this class?"
 * question. Walking src/ instead counts a component nobody imports, and
 * walking scripts/ too counts a class named in a check that asserts the
 * component is gone — both of which kept dead rules alive.
 */
export function reachableModules() {
  const cache = new Map();
  const all = new Set();
  for (const { entries } of routeEntries()) {
    for (const entry of entries) {
      for (const file of closure(entry, cache)) all.add(file);
    }
  }
  return all;
}

export function analyzeSurfaces() {
  const pages = walk(join(SRC, "app"), [".tsx"]).filter((f) => f.endsWith("/page.tsx"));

  /** surface name -> Set of identifiers reachable from its routes */
  const surfaces = new Map();
  const cache = new Map();

  for (const page of pages) {
    const route = page.replace(join(SRC, "app"), "").replace(/\/page\.tsx$/, "") || "/";
    const surface = route.startsWith("/dashboard") ? "dashboard" : "public";

    const modules = new Set();
    for (const entry of [page, ...layoutsFor(page)]) {
      for (const m of closure(entry, cache)) modules.add(m);
    }

    if (!surfaces.has(surface)) surfaces.set(surface, new Set());
    const bucket = surfaces.get(surface);
    for (const file of modules) {
      const text = readFileSync(file, "utf8")
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      for (const lit of text.matchAll(stringLiteralRe)) {
        const body = lit[1] ?? lit[2] ?? lit[3] ?? "";
        for (const token of body.matchAll(tokenRe)) bucket.add(token[0]);
      }
    }
  }

  return surfaces;
}
