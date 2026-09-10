/**
 * Resolve the app's "@/..." imports for `node --test`.
 *
 * Every module under src/ imports by alias, so without this a unit test can
 * only reach files that happen to have no dependencies. That quietly pushes
 * logic worth testing out of reach — the fix belongs in the runner, not in the
 * source.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../..");
const srcRoot = resolvePath(repoRoot, "src");
const nodeModules = resolvePath(repoRoot, "node_modules");
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

/**
 * Resolve an extensionless subpath into a package that declares no "exports".
 *
 * `next/server` is a real file that ESM refuses to load without its extension,
 * and every route handler imports it — so without this the only way to test a
 * route is to re-implement it, which is the habit these tests exist to break.
 * Restricted to packages with no exports map, so a package that deliberately
 * redirects its subpaths keeps deciding for itself.
 */
function resolveExtensionlessSubpath(specifier) {
  if (specifier.startsWith(".") || specifier.startsWith("/")) return null;
  if (!specifier.includes("/") || extname(specifier)) return null;

  const scoped = specifier.startsWith("@");
  const pkg = specifier.split("/").slice(0, scoped ? 2 : 1).join("/");
  const manifest = resolvePath(nodeModules, pkg, "package.json");
  if (!existsSync(manifest)) return null;

  try {
    if (JSON.parse(readFileSync(manifest, "utf8")).exports) return null;
  } catch {
    return null;
  }

  const candidate = resolvePath(nodeModules, `${specifier}.js`);
  return existsSync(candidate) ? candidate : null;
}

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) {
    const subpath = resolveExtensionlessSubpath(specifier);
    if (subpath) return nextResolve(pathToFileURL(subpath).href, context);
    return nextResolve(specifier, context);
  }

  const base = resolvePath(srcRoot, specifier.slice(2));
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }

  return nextResolve(specifier, context);
}
