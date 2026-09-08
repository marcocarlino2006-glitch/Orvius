/**
 * Resolve the app's "@/..." imports for `node --test`.
 *
 * Every module under src/ imports by alias, so without this a unit test can
 * only reach files that happen to have no dependencies. That quietly pushes
 * logic worth testing out of reach — the fix belongs in the runner, not in the
 * source.
 */
import { existsSync } from "node:fs";
import { dirname, resolve as resolvePath } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const srcRoot = resolvePath(dirname(fileURLToPath(import.meta.url)), "../../src");
const EXTENSIONS = ["", ".ts", ".tsx", ".mjs", ".js", "/index.ts", "/index.tsx"];

export function resolve(specifier, context, nextResolve) {
  if (!specifier.startsWith("@/")) return nextResolve(specifier, context);

  const base = resolvePath(srcRoot, specifier.slice(2));
  for (const extension of EXTENSIONS) {
    const candidate = `${base}${extension}`;
    if (existsSync(candidate)) {
      return nextResolve(pathToFileURL(candidate).href, context);
    }
  }

  return nextResolve(specifier, context);
}
