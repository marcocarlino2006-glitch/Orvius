/**
 * What the app can actually reach from a URL.
 *
 * Every question of the form "does anything still use this?" needs this graph
 * to answer honestly. Walking src/ instead answers "does this text appear
 * anywhere", which counts a component nobody imports and a class named in a
 * check that asserts the component is gone.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "../..");

const SRC = join(repoRoot, "src");
const APP = join(SRC, "app");

export function walk(dir, exts, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (entry === "node_modules" || entry === ".next" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, exts, out);
    else if (exts.includes(extname(full))) out.push(full);
  }
  return out;
}

const MODULE_EXTS = [".tsx", ".ts", ".jsx", ".js"];

/** Resolve an import specifier to a file on disk, or null if it is a package. */
function resolveImport(specifier, fromFile) {
  let base;
  if (specifier.startsWith("@/")) base = join(SRC, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(fromFile), specifier);
  else return null;

  const candidates = [base, ...MODULE_EXTS.flatMap((e) => [`${base}${e}`, join(base, `index${e}`)])];
  for (const candidate of candidates) {
    if (!MODULE_EXTS.includes(extname(candidate))) continue;
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/*
  `require` is matched as well as `import`. Missing one form of import is how
  this graph would report a live module dead, and the cost of that mistake is
  deleting something the product renders.
*/
const importRe = /(?:from\s+|import\s*\(\s*|require\s*\(\s*)["']([^"']+)["']/g;

/** Every module reachable from `entry`, transitively. */
export function closure(entry, cache = new Map()) {
  const cached = cache.get(entry);
  if (cached) return cached;

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
  Layouts wrap every page beneath them, so a class a layout renders belongs to
  each surface under it and not to the layout's own folder.
*/
function layoutsFor(pageFile) {
  const layouts = [];
  let dir = dirname(pageFile);
  while (dir.startsWith(APP)) {
    const candidate = join(dir, "layout.tsx");
    if (existsSync(candidate)) layouts.push(candidate);
    if (dir === APP) break;
    dir = dirname(dir);
  }
  return layouts;
}

/*
  Next.js reaches these by filename rather than by import, so nothing in the
  graph points at them and they have to be named. Route handlers are entry
  points too: they render no DOM, but they are the reason most of src/lib is
  alive, and a module-reachability check that omitted them would call half the
  business logic dead.
*/
const CONVENTION_ENTRY = /\/(route|middleware|icon|apple-icon|opengraph-image|twitter-image|sitemap|robots|manifest|not-found|error|global-error|loading|template|default)\.(tsx?|jsx?)$/;

/** Each page, the layouts that wrap it, and which surface it belongs to. */
export function routeEntries() {
  return walk(APP, [".tsx"])
    .filter((f) => f.endsWith("/page.tsx"))
    .map((page) => {
      const route = page.replace(APP, "").replace(/\/page\.tsx$/, "") || "/";
      return {
        page,
        route,
        surface: route.startsWith("/dashboard") ? "dashboard" : "public",
        entries: [page, ...layoutsFor(page)],
      };
    });
}

/** Modules reachable from a rendered page — the only ones that can style anything. */
export function renderedModules() {
  const cache = new Map();
  const all = new Set();
  for (const { entries } of routeEntries()) {
    for (const entry of entries) {
      for (const file of closure(entry, cache)) all.add(file);
    }
  }
  return all;
}

/**
 * Modules reachable from any entry the repo has: pages, route handlers, and
 * the scripts behind the npm commands.
 *
 * Scripts count here but deliberately not in renderedModules. src/lib/ai-eval
 * exists for `npm run ai:eval` and renders nothing, so it is alive as code and
 * absent from the DOM — two different questions with two different answers.
 */
export function reachableModules() {
  const cache = new Map();
  const all = new Set(renderedModules());
  const roots = [
    ...walk(SRC, MODULE_EXTS).filter((f) => CONVENTION_ENTRY.test(f)),
    ...walk(join(repoRoot, "scripts"), [".mjs", ".cjs", ".js"]),
  ];
  for (const file of roots) {
    for (const target of closure(file, cache)) all.add(target);
  }
  return all;
}

/**
 * Modules nothing can reach.
 *
 * Type declarations are excluded: they are consumed by the compiler rather
 * than imported, so absence from the graph says nothing about them.
 */
export function orphanModules() {
  const reachable = reachableModules();
  return walk(SRC, MODULE_EXTS).filter(
    (file) => !reachable.has(file) && !file.endsWith(".d.ts") && !CONVENTION_ENTRY.test(file),
  );
}
