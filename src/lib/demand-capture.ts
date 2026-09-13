import {
  classifyDemand,
  isDemandCategoryCode,
  type DemandCategoryCode,
} from "@/lib/job-taxonomy";
import { extractPostalCode } from "@/lib/service-area";
import { inferTradeFromBusiness, type Trade } from "@/lib/trades";

export type DemandSignal = {
  categoryCode: DemandCategoryCode | null;
  postalCode: string | null;
};

/**
 * The one place a lead's demand signal is derived.
 *
 * Every write path — voice, SMS, demo, import — routes through here, because a
 * dataset with three of four sources classified is a dataset nobody can quote.
 * A call that happened without this is a call whose category is gone: there is
 * no re-running last winter's phone traffic.
 */
export function deriveDemandSignal(input: {
  /** Free-text service request from the voice agent's extraction. */
  serviceType?: string | null;
  notes?: string | null;
  /** Call summary, used only when the shorter fields say nothing useful. */
  summary?: string | null;
  address?: string | null;
  /** Category the voice agent chose from the enum, when it offered one. */
  categoryHint?: string | null;
  trade?: Trade | null;
}): DemandSignal {
  // Inbound texts have no address field at all — the street and ZIP arrive in
  // the message. Prefer the real address field, then look where else it lands.
  const postalCode =
    extractPostalCode(input.address) ??
    extractPostalCode(input.notes) ??
    extractPostalCode(input.summary);

  // The agent picked from a fixed list on the call, with the caller still on
  // the line. Nothing downstream knows more than that.
  if (isDemandCategoryCode(input.categoryHint)) {
    return { categoryCode: input.categoryHint, postalCode };
  }

  const trade = input.trade ?? null;

  // Two passes, precision first: "AC not cooling" should not have to survive a
  // paragraph of transcript to be read correctly.
  const primary = classifyDemand({ text: input.serviceType, trade });
  if (primary) return { categoryCode: primary, postalCode };

  const widened = [input.serviceType, input.notes, input.summary]
    .filter(Boolean)
    .join(" ");

  return { categoryCode: classifyDemand({ text: widened, trade }), postalCode };
}

/** Trade prior for a shop, so its own vocabulary resolves inside its trade. */
export function tradeForCapture(business: {
  servicesJson?: string | null;
  name?: string | null;
}) {
  return inferTradeFromBusiness(business);
}
