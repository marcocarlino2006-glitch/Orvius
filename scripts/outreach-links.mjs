#!/usr/bin/env node
/**
 * Turn a prospect list into ready-to-send messages, each with the shop's own
 * "hear Orvius answer as <business>" link.
 *
 *   node --experimental-strip-types --import ./scripts/lib/register-alias.mjs scripts/outreach-links.mjs prospects.csv [--ref batch1] > out.csv
 *
 * Input headers (any order): businessName|business|name|company, trade|industry|category, city, phone, email, owner|contact
 * Output: the input columns plus link and message. Rows without a business name are skipped.
 */
import { readFileSync } from "node:fs";
import { hearLink, spokenBusinessName } from "../src/lib/hear-link.ts";
import { fillOutreachTemplate, outreachTemplates } from "../src/lib/outreach-templates.ts";
import { splitCsvLine } from "../src/lib/prospect-csv.ts";

export function outreachRows(text, ref) {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const headers = splitCsvLine(lines[0]);
  const norm = headers.map((h) => h.trim().toLowerCase().replace(/[\s_]+/g, ""));
  const col = (...names) => norm.findIndex((h) => names.includes(h));
  const at = { business: col("businessname", "business", "name", "company"), trade: col("trade", "industry", "category"), city: col("city", "market"), owner: col("owner", "contact", "firstname") };
  const body = outreachTemplates.find((t) => t.id === "cold_dm").body;
  const out = [];
  for (const line of lines.slice(1)) {
    const cols = splitCsvLine(line);
    const business = spokenBusinessName(cols[at.business] ?? "");
    if (!business) continue;
    const link = hearLink({ business, trade: cols[at.trade], city: cols[at.city], ref });
    const owner = at.owner >= 0 ? cols[at.owner]?.trim().split(/\s+/)[0] : "";
    const message = fillOutreachTemplate(body, { name: owner || "there", business, link });
    out.push({ cols, link, message, headers });
  }
  return out;
}

const csv = (v) => (/[",\n]/.test(v) ? `"${String(v).replaceAll('"', '""')}"` : v);

if (import.meta.url === `file://${process.argv[1]}`) {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: outreach-links.mjs prospects.csv [--ref batch1]");
    process.exit(1);
  }
  const args = process.argv.slice(3);
  const ref = args.includes("--ref") ? args[args.indexOf("--ref") + 1] : "outreach";
  const rows = outreachRows(readFileSync(file, "utf8"), ref);
  if (!rows.length) process.exit(0);
  console.log([...rows[0].headers, "link", "message"].map(csv).join(","));
  for (const r of rows) console.log([...r.headers.map((_, i) => r.cols[i] ?? ""), r.link, r.message].map(csv).join(","));
  console.error(`${rows.length} messages ready.`);
}
