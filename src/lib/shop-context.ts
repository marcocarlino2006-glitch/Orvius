import { AI_POLICY_VERSION } from "@/lib/ai-policy";
import type { ShopMemory } from "@/lib/shop-memory";

export const DEFAULT_CONTEXT_BUDGET_CHARS = 6_000;

export type ShopContextRecord = {
  source: "customer" | "job" | "lead" | "call";
  recordId: string;
  href: string;
  observedAt: string;
  title: string;
  facts: string;
};

export type ShopContextPacket = {
  policyVersion: string;
  generatedAt: string;
  query: string;
  totals: ShopMemory["stats"];
  records: ShopContextRecord[];
  truncated: boolean;
  text: string;
};

/**
 * Turn retrieval results into bounded, provenance-bearing, untrusted JSON.
 *
 * Raw notes and transcripts can contain phrases that look like instructions.
 * JSON does not magically make them safe, so the system prompt explicitly
 * treats every record as data; the packet makes the boundary auditable and
 * ensures every fact retains its source row and timestamp.
 */
export function buildShopContextPacket(
  memory: ShopMemory,
  options: { maxChars?: number; now?: Date } = {},
): ShopContextPacket {
  const maxChars = Math.max(800, options.maxChars ?? DEFAULT_CONTEXT_BUDGET_CHARS);
  const records: ShopContextRecord[] = [];
  const generatedAt = (options.now ?? new Date()).toISOString();
  let truncated = false;

  for (const hit of memory.hits) {
    const record: ShopContextRecord = {
      source: hit.type,
      recordId: hit.id,
      href: hit.href,
      observedAt: hit.observedAt,
      title: hit.title.slice(0, 240),
      facts: hit.summary.slice(0, 1_200),
    };
    const candidate = {
      policyVersion: AI_POLICY_VERSION,
      generatedAt,
      query: memory.query,
      totals: memory.stats,
      records: [...records, record],
      truncated: false,
    };
    if (JSON.stringify(candidate, null, 2).length > maxChars) {
      truncated = true;
      break;
    }
    records.push(record);
  }

  const core = {
    policyVersion: AI_POLICY_VERSION,
    generatedAt,
    query: memory.query,
    totals: memory.stats,
    records,
    truncated,
  };
  return { ...core, text: JSON.stringify(core, null, 2) };
}
