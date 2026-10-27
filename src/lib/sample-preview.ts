/**
 * The day a visitor sees before they have a shop.
 * These rows are written here. They are not read from a business, and they are not a shop's number.
 * A shop that signs up gets its own line and its own customers.
 */

export const SAMPLE_SHOP_NAME = "Summit Heating & Air";

export const SAMPLE_ROWS = [
  {
    who: "Nora Walsh",
    title: "Water pooling under the furnace",
    address: null,
    phone: "+1 312 555 0148",
  },
  {
    who: "Tom Becker",
    title: "No heat",
    address: "77 Main St, Evanston IL 60202",
    phone: "+1 312 555 0164",
  },
  {
    who: "Helen Brooks",
    title: "Replacement quote visit",
    address: "311 Lake St, Evanston IL 60201",
    phone: "+1 312 555 0152",
  },
] as const;

/** Shell-only preview. No line, so the desk never shows another shop's number. */
export function sampleDeskPreview() {
  return {
    business: {
      name: SAMPLE_SHOP_NAME,
      trade: "HVAC",
      line: null as string | null,
      ownerPhone: null as string | null,
      guest: true,
      referenceImplementation: true,
    },
    metrics: {
      callsToday: 0,
      leadsToday: 0,
      newLeads: 0,
      totalCalls: 0,
      totalLeads: 0,
      leadBookingRate: null as number | null,
      lastCallAt: null as string | null,
      lastCaller: null as string | null,
    },
    work: { needsYou: 0, open: 0, items: [], approvals: [], shopIssues: [] },
  };
}
