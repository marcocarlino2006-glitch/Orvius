import type { RelianceVerdict } from "@/lib/shop-reliance";

export function relianceLines(all: RelianceVerdict[]): string[] {
  const judged = all.filter((r) => r.verdict !== "too_new");
  const relies = judged.filter((r) => r.verdict === "relies").length;
  const slipping = judged.filter((r) => r.verdict === "slipping");
  const head = judged.length
    ? `Shops relying on Orvius, 14 days: ${relies} of ${judged.length}`
    : "Shops relying on Orvius: none old enough to judge yet";
  if (!slipping.length) return [head, "Shops slipping: none"];
  return [
    head,
    `Shops slipping: ${slipping.length}`,
    ...slipping.slice(0, 10).map((r) => `  - ${r.name}: ${r.reason}`),
    ...(slipping.length > 10 ? [`  - and ${slipping.length - 10} more on the board`] : []),
  ];
}
