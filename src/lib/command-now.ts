import { commandSentence } from "@/lib/command-sentence";
import { isLiveCall } from "@/lib/live-call";
import { personLabel, spokenName } from "@/lib/spoken-name";
import { formatBeat } from "@/lib/when";

/**
 * The same sentence Home shows. Ask reads this function, so the two screens
 * open on one line instead of Ask inventing a second question.
 */
type Approval = {
  proposalId?: string;
  title: string;
  preview?: string;
  needsCheck?: string;
};

type Item = {
  approvalId: string | null;
  needsYou: boolean;
  title: string;
  customer: string | null;
  nextAction: string | null;
  scheduledAt: string | null;
  technician?: { name: string } | null;
  lang?: "es" | null;
};

type Call = {
  id: string;
  status: string;
  createdAt: string;
  leadName: string | null;
  callerPhone: string | null;
};

export type CommandShop = {
  business?: {
    line?: string | null;
    referenceImplementation?: boolean;
    demoWorkspace?: boolean;
    testMode?: boolean;
  } | null;
  coverage?: { timezone?: string | null } | null;
  personalBrief?: { headline: string } | null;
  recentCalls?: Call[];
  work?: { items: Item[]; approvals: Approval[] };
  handled?: { events: Array<{ summary: string }> };
};

export function commandNow(data: CommandShop | null | undefined): string {
  const items = data?.work?.items ?? [];
  const approvals = data?.work?.approvals ?? [];
  const attached = new Set(items.map((item) => item.approvalId).filter(Boolean));
  const liveApproval = approvals.find((approval) => approval.proposalId && !attached.has(approval.proposalId)) ?? null;
  const liveItem = items.find((item) => item.needsYou) ?? null;
  const liveCall = (data?.recentCalls ?? []).find((call) => isLiveCall(call.status, call.createdAt)) ?? null;
  const onTheLine = liveCall ? personLabel(liveCall.leadName, liveCall.callerPhone) : "";
  const lastDone = data?.handled?.events[0] ?? null;
  return commandSentence({
    loaded: Boolean(data),
    brief: data?.personalBrief?.headline ?? null,
    live: onTheLine.trim() ? { who: onTheLine } : null,
    approval: liveApproval
      ? { title: liveApproval.preview ?? liveApproval.title, needsCheck: Boolean(liveApproval.needsCheck) }
      : null,
    item: liveItem
      ? {
          title: liveItem.title,
          customer: liveItem.customer,
          nextAction: liveItem.nextAction,
          needsYou: liveItem.needsYou,
          when: liveItem.scheduledAt ? formatBeat(liveItem.scheduledAt, data?.coverage?.timezone) : null,
          tech: liveItem.technician?.name ? spokenName(liveItem.technician.name).split(/\s+/)[0] || null : null,
          spanish: liveItem.lang === "es",
        }
      : null,
    lastSummary: !liveApproval && !liveItem ? (lastDone?.summary ?? null) : null,
    lineOff: Boolean(
      data && !data.business?.line && !data.business?.referenceImplementation && !data.business?.demoWorkspace && !data.business?.testMode,
    ),
  });
}
