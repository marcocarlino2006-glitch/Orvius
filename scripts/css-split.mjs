#!/usr/bin/env node
/**
 * Move the rules only the dashboard can reach into the dashboard's own sheet.
 *
 * One 384kb stylesheet loaded from the root layout means every surface pays for
 * every other, and worse, that they share a namespace: a marketing rule and a
 * product rule are one careless selector apart, with nothing but naming
 * convention between them. Splitting is what turns that convention into a
 * boundary the build can check.
 *
 * A rule moves only when every class it needs is unreachable from the public
 * and admin surfaces. Rules with no class at all — bare elements, :root, token
 * blocks — never move: they apply everywhere by definition.
 *
 * Usage: node scripts/css-split.mjs [--write]
 */
import { readFileSync, writeFileSync } from "node:fs";

import postcss from "postcss";

import { requiredClasses } from "./lib/css-usage.mjs";
import { analyzeSurfaces } from "./lib/css-surface.mjs";
import { repoRoot } from "./lib/module-graph.mjs";

const WRITE = process.argv.includes("--write");
const SOURCE = "src/app/globals.css";
const TARGET = "src/app/dashboard/dashboard.css";

const surfaces = analyzeSurfaces();
const dashboard = surfaces.get("dashboard") ?? new Set();
const elsewhere = new Set(
  [...surfaces].filter(([name]) => name !== "dashboard").flatMap(([, set]) => [...set]),
);

/** True when the dashboard is the only surface that can render this rule. */
function dashboardOnly(rule) {
  const classes = rule.selectors.flatMap(requiredClasses);
  if (!classes.length) return false;
  return classes.every((c) => dashboard.has(c) && !elsewhere.has(c));
}

/*
  Everything below exists because a nested layout's stylesheet loads after the
  root layout's, so moving a rule out of globals.css also moves it later in the
  cascade. The first run of this script moved `.account-legal-links a`, which
  had been losing to `.os-shell-night a` further down the same file at identical
  specificity — and once it landed in dashboard.css it started winning, turning
  four links on the billing page from near-white to ash. A refactor that repaints
  anything is not a refactor, so a rule now moves only when nothing about which
  declaration wins can depend on where it sits.
*/

/** (ids, classes, elements), the three-part specificity of a single selector. */
function specificity(selector) {
  const cleaned = selector
    .replace(/:not\(([^)]*)\)/g, " $1 ")
    .replace(/::[a-z-]+(\([^)]*\))?/g, " ELEMENT ")
    .replace(/\[[^\]]*\]/g, " CLASS ");
  const ids = (cleaned.match(/#[\w-]+/g) ?? []).length;
  const classes =
    (cleaned.match(/\.[-\w]+/g) ?? []).length +
    (cleaned.match(/:[a-z-]+(\([^)]*\))?/g) ?? []).length +
    (cleaned.match(/\bCLASS\b/g) ?? []).length;
  const elements =
    (cleaned.match(/(^|[\s>+~])[a-z][\w-]*/g) ?? []).length +
    (cleaned.match(/\bELEMENT\b/g) ?? []).length;
  return [ids, classes, elements];
}

const compare = (a, b) => {
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
  return 0;
};

/** The strongest specificity in a selector list, since any entry may match. */
const ruleWeight = (rule) =>
  rule.selectors.map(specificity).reduce((a, b) => (compare(a, b) >= 0 ? a : b));

/** Property -> whether this rule declares it !important. */
function declarations(rule) {
  const props = new Map();
  for (const node of rule.nodes ?? []) {
    if (node.type !== "decl") continue;
    const prop = node.prop.toLowerCase();
    props.set(prop, Boolean(node.important) || props.get(prop) === true);
  }
  return props;
}

/** The class names in the last compound of a selector, which is what it targets. */
function subjectClasses(selector) {
  const last = selector.trim().split(/[\s>+~]+/).pop() ?? "";
  return requiredClasses(last);
}

/**
 * Whether two rules could ever land on the same element.
 *
 * If both selectors end in a class and none of those classes coincide, no
 * element carries both and their order is irrelevant. Anything less definite
 * than that counts as overlapping, including different at-rule contexts: a
 * rule under `@media (max-width: 700px)` and one outside it both apply at some
 * viewport, so the narrow window is not a reason to assume independence.
 */
function mayCollide(a, b) {
  const aSubjects = a.selectors.flatMap(subjectClasses);
  const bSubjects = b.selectors.flatMap(subjectClasses);
  if (!aSubjects.length || !bSubjects.length) return true;
  return aSubjects.some((cls) => bSubjects.includes(cls));
}

/**
 * Whether the outcome between two rules is decided by something other than
 * their order, and so cannot change when one of them moves.
 *
 * !important beats unimportant, and higher specificity beats lower, whichever
 * came first. Only a tie on both leaves document order as the tiebreak — that
 * is the one case where moving a rule changes what the browser paints.
 */
function orderDecides(candidate, later) {
  const mine = declarations(candidate);
  const theirs = declarations(later);
  const shared = [...mine.keys()].filter((prop) => theirs.has(prop));
  if (!shared.length) return false;
  if (!shared.some((prop) => mine.get(prop) === theirs.get(prop))) return false;
  if (compare(ruleWeight(candidate), ruleWeight(later)) !== 0) return false;
  return mayCollide(candidate, later);
}

/*
  A moved rule has to keep the at-rules it was nested in, or a rule that only
  applied under `@media (min-width: 900px)` starts applying at every width.
  The chain is rebuilt in the target sheet and reused, so the moved rules stay
  grouped the way they were written rather than each growing its own wrapper.
*/
function mirrorAncestors(rule, target, mirrors) {
  const chain = [];
  for (let node = rule.parent; node && node.type === "atrule"; node = node.parent) {
    chain.unshift(node);
  }
  let parent = target;
  let key = "";
  for (const atRule of chain) {
    key += `@${atRule.name} ${atRule.params}\n`;
    let mirror = mirrors.get(key);
    if (!mirror) {
      mirror = postcss.atRule({ name: atRule.name, params: atRule.params });
      parent.append(mirror);
      mirrors.set(key, mirror);
    }
    parent = mirror;
  }
  return parent;
}

const source = postcss.parse(readFileSync(`${repoRoot}/${SOURCE}`, "utf8"));
const target = postcss.root();
const mirrors = new Map();

/* Document order, which is the only thing the cascade check has to reason about. */
const ordered = [];
source.walkRules((rule) => {
  /* Keyframe steps are `from`/`to`/percentages, not classes, and a keyframe is
     only meaningful whole — so animations stay with the sheet that names them. */
  if (rule.parent?.type === "atrule" && /keyframes$/.test(rule.parent.name)) return;
  ordered.push(rule);
});

const movable = new Set(ordered.filter(dashboardOnly));

/*
  Held back to a fixed point rather than in one pass. Pinning a rule turns it
  into something that stays behind, and a rule that stays behind can be the
  reason an earlier one has to stay too.
*/
let pinned;
do {
  pinned = 0;
  for (let i = 0; i < ordered.length; i++) {
    const candidate = ordered[i];
    if (!movable.has(candidate)) continue;
    for (let j = i + 1; j < ordered.length; j++) {
      const later = ordered[j];
      if (movable.has(later)) continue;
      if (orderDecides(candidate, later)) {
        movable.delete(candidate);
        pinned += 1;
        break;
      }
    }
  }
} while (pinned > 0);

const moving = ordered.filter((rule) => movable.has(rule));
const heldBack = ordered.filter(dashboardOnly).length - moving.length;

let bytes = 0;
for (const rule of moving) {
  bytes += rule.toString().length;
  mirrorAncestors(rule, target, mirrors).append(rule.clone());
  rule.remove();
}

/* An at-rule emptied by the move would otherwise be left behind as `@media
   (...) {}` — valid, meaningless, and the kind of residue that makes the next
   reader think a rule went missing. */
let emptied = 0;
let removedOne = true;
while (removedOne) {
  removedOne = false;
  source.walkAtRules((atRule) => {
    if (atRule.nodes && atRule.nodes.length === 0) {
      atRule.remove();
      emptied += 1;
      removedOne = true;
    }
  });
}

const header = `/*
  Rules only the dashboard can reach.

  Split out of globals.css because the root layout loads that sheet on every
  route, so a prospect reading the pricing page was downloading the whole
  product UI. Generated by scripts/css-split.mjs and enforced by standard:check,
  which fails if a dashboard-only rule reappears in globals.css.

  Imported from src/app/dashboard/layout.tsx, so it lands after globals.css in
  the cascade. That ordering is deliberate and load-bearing: these rules are the
  most specific statement about a dashboard element, and they should win.
*/
`;

console.log(
  `${moving.length} rules moved · ${(bytes / 1024).toFixed(1)}kb` +
    `${heldBack ? ` · ${heldBack} held back: order decides them against a rule that stays` : ""}` +
    `${emptied ? ` · ${emptied} emptied at-rule(s) removed` : ""}` +
    `${WRITE ? "" : "  (dry run — pass --write to apply)"}`,
);

if (WRITE) {
  writeFileSync(`${repoRoot}/${SOURCE}`, source.toString());
  writeFileSync(`${repoRoot}/${TARGET}`, header + target.toString() + "\n");
  console.log(`wrote ${TARGET}`);
}
