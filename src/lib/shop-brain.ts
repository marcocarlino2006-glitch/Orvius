import { vapiRequest } from "@/lib/vapi";
import {
  composeMemoryAnswer,
  retrieveShopMemory,
  type MemoryHit,
  type ShopMemory,
} from "@/lib/shop-memory";
import { getShopOutcomes } from "@/lib/shop-outcomes";

type VapiChatResponse = {
  output?: Array<{ content?: string } | string>;
  assistant?: { content?: string };
};

function extractVapiText(payload: VapiChatResponse): string | null {
  const output = payload.output;
  if (Array.isArray(output) && output.length) {
    const first = output[0];
    if (typeof first === "string" && first.trim()) return first.trim();
    if (first && typeof first === "object" && typeof first.content === "string") {
      return first.content.trim();
    }
  }
  if (typeof payload.assistant?.content === "string") {
    return payload.assistant.content.trim();
  }
  return null;
}

function isOutcomesQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return (
    q.includes("book") ||
    q.includes("booking") ||
    q.includes("how many job") ||
    q.includes("after-hours") ||
    q.includes("after hours") ||
    q.includes("this week") ||
    q.includes("outcomes") ||
    q.includes("utilization")
  );
}

function formatOutcomesAnswer(
  outcomes: Awaited<ReturnType<typeof getShopOutcomes>>,
): string {
  const booking =
    outcomes.bookingRate != null
      ? `${outcomes.bookingRate}% of leads became jobs`
      : "no leads yet to compute a booking rate";
  const lines = [
    `Last ${outcomes.windowDays} days:`,
    `${outcomes.calls} calls · ${outcomes.leads} leads · ${outcomes.jobsBooked} jobs booked (${booking}).`,
  ];
  if (outcomes.afterHoursLeads > 0) {
    lines.push(`${outcomes.afterHoursLeads} after-hours leads captured.`);
  }
  if (outcomes.emergenciesBooked > 0) {
    lines.push(`${outcomes.emergenciesBooked} emergencies booked.`);
  }
  if (outcomes.unassignedJobs > 0) {
    lines.push(`${outcomes.unassignedJobs} jobs still need a technician.`);
  }
  if (outcomes.jobsPerTech != null) {
    lines.push(`${outcomes.jobsPerTech} jobs per active tech.`);
  }
  return lines.join(" ");
}

async function polishWithVapi(question: string, memory: ShopMemory): Promise<string | null> {
  if (!process.env.VAPI_API_KEY?.trim()) return null;

  const records = memory.hits
    .map(
      (hit, i) =>
        `${i + 1}. [${hit.type}] ${hit.title}\n   ${hit.summary}\n   link: ${hit.href}`,
    )
    .join("\n");

  const system = [
    "You are Orvius, the operating system for this service business.",
    "Answer the owner using ONLY the shop memory below.",
    "If the memory does not contain the answer, say so. Never invent customers, times, or prices.",
    "Be concise. Use names, phones, and times from the records.",
    "",
    "SHOP MEMORY:",
    records || "(no matching records)",
    `Totals: ${memory.stats.customers} customers, ${memory.stats.jobs} jobs, ${memory.stats.leads} leads, ${memory.stats.calls} calls.`,
  ].join("\n");

  try {
    const chat = await vapiRequest<VapiChatResponse>("/chat", {
      method: "POST",
      body: JSON.stringify({
        assistant: {
          name: "Orvius Shop Brain",
          model: {
            provider: "openai",
            model: "gpt-4o-mini",
            messages: [{ role: "system", content: system }],
          },
        },
        input: question,
        stream: false,
      }),
    });
    return extractVapiText(chat);
  } catch {
    return null;
  }
}

export type AskResult = {
  answer: string;
  source: "memory" | "memory+model" | "outcomes";
  hits: MemoryHit[];
  stats: ShopMemory["stats"];
};

export async function askShop(question: string, businessId: string): Promise<AskResult> {
  if (isOutcomesQuestion(question)) {
    const outcomes = await getShopOutcomes(businessId, 7);
    return {
      answer: formatOutcomesAnswer(outcomes),
      source: "outcomes",
      hits: [],
      stats: {
        customers: 0,
        jobs: outcomes.jobsBooked,
        leads: outcomes.leads,
        calls: outcomes.calls,
      },
    };
  }

  const memory = await retrieveShopMemory(question, businessId);
  const grounded = composeMemoryAnswer(memory);
  const polished = await polishWithVapi(question, memory);

  return {
    answer: polished || grounded,
    source: polished ? "memory+model" : "memory",
    hits: memory.hits,
    stats: memory.stats,
  };
}
