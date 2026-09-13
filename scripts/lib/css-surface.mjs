/**
 * Which surface each CSS class belongs to.
 *
 * A route's stylesheet is decided by what it can reach, not by what sits next
 * to it in the tree. So this walks out from every page and the layouts wrapping
 * it, and asks of each class which surfaces name it at all.
 */
import { readFileSync } from "node:fs";

import { closure, routeEntries } from "./module-graph.mjs";

/*
  Only string literals are read. A class name reaches the DOM as text, so a
  bare identifier scan credits any surface with a variable called `card` or
  `title` — which put 969 rules in the shared bucket the first time.
*/
const stringLiteralRe = /"([^"\\\n]*)"|'([^'\\\n]*)'|`((?:[^`\\]|\\.)*)`/g;
const tokenRe = /[A-Za-z][\w-]*/g;

const strip = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

/** surface name -> every class-shaped token its routes can render. */
export function analyzeSurfaces() {
  const surfaces = new Map();
  const cache = new Map();

  for (const { surface, entries } of routeEntries()) {
    if (!surfaces.has(surface)) surfaces.set(surface, new Set());
    const bucket = surfaces.get(surface);

    for (const entry of entries) {
      for (const file of closure(entry, cache)) {
        for (const lit of strip(readFileSync(file, "utf8")).matchAll(stringLiteralRe)) {
          const body = lit[1] ?? lit[2] ?? lit[3] ?? "";
          for (const token of body.matchAll(tokenRe)) bucket.add(token[0]);
        }
      }
    }
  }

  return surfaces;
}
