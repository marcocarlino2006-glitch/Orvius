/*
 * Prints the launch gate: for every candidate trade, each of the five checks
 * and what failed. `npm run launch:verify`. Exits 1 when the launched list in
 * src/lib/trades.ts and the trades that pass disagree.
 */
const { LAUNCH_CRITERIA, verifyAllTrades } = await import("../src/lib/launch-verification.ts");
const { LAUNCH_TRADES } = await import("../src/lib/trades.ts");

const results = verifyAllTrades();
for (const r of results) {
  console.log(`\n${r.passed ? "PASS" : "FAIL"}  ${r.trade}${LAUNCH_TRADES.includes(r.trade) ? "  (launched)" : ""}`);
  for (const c of LAUNCH_CRITERIA) {
    const failures = r.criteria[c.key];
    console.log(`  ${failures.length ? "x" : "ok"}  ${c.label}`);
    for (const f of failures.slice(0, 4)) console.log(`        - ${f}`);
    if (failures.length > 4) console.log(`        - and ${failures.length - 4} more`);
  }
}
const passing = results.filter((r) => r.passed).map((r) => r.trade);
const agree = passing.length === LAUNCH_TRADES.length && passing.every((t) => LAUNCH_TRADES.includes(t));
console.log(`\nPassing: ${passing.join(", ") || "none"}. Launched: ${LAUNCH_TRADES.join(", ")}.${agree ? "" : " These disagree."}`);
process.exit(agree ? 0 : 1);
