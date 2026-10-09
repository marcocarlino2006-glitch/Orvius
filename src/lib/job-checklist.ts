import { classifyDemand } from "@/lib/job-taxonomy";
import type { Trade } from "@/lib/trades";

/*
  What a careful technician checks on this kind of visit, so the office and the
  next tech can see it was done, and so readings (pressures, temperatures,
  carbon monoxide) live on the job instead of in a truck notebook. A job keeps
  the copy it started with: changing a template never rewrites a past visit.
*/

export type ChecklistTemplateItem = { id: string; label: string; reading?: string };
export type ChecklistTemplate = { id: string; title: string; items: ChecklistTemplateItem[] };
export type ChecklistItem = { id: string; label: string; reading?: string; done: boolean; value: string | null; at: string | null };
export type JobChecklist = { templateId: string; title: string; items: ChecklistItem[]; done: number; total: number };

const LEFT_RUNNING: ChecklistTemplateItem = { id: "left_running", label: "System running and customer shown before I left" };
const CLEAN_UP: ChecklistTemplateItem = { id: "clean_up", label: "Work area cleaned up" };

export const CHECKLIST_TEMPLATES: Record<string, ChecklistTemplate> = {
  hvac_cooling: {
    id: "hvac_cooling",
    title: "Cooling call",
    items: [
      { id: "thermostat", label: "Thermostat set and calling for cooling" },
      { id: "filter", label: "Air filter checked or replaced" },
      { id: "breaker_disconnect", label: "Breaker and outdoor disconnect on" },
      { id: "capacitor", label: "Capacitor tested", reading: "µF" },
      { id: "contactor", label: "Contactor checked" },
      { id: "pressures", label: "Refrigerant pressures recorded", reading: "Suction / head psi" },
      { id: "split", label: "Supply and return temperatures", reading: "Return / supply °F" },
      { id: "condensate", label: "Condensate drain clear" },
      { id: "coil", label: "Outdoor coil clean and clear" },
      LEFT_RUNNING,
    ],
  },
  hvac_heating: {
    id: "hvac_heating",
    title: "Heating call",
    items: [
      { id: "thermostat", label: "Thermostat set and calling for heat" },
      { id: "filter", label: "Air filter checked or replaced" },
      { id: "gas_on", label: "Gas valve and power to the unit on" },
      { id: "ignition", label: "Ignition and flame checked" },
      { id: "flame_sensor", label: "Flame sensor cleaned", reading: "µA" },
      { id: "heat_exchanger", label: "Heat exchanger visually inspected" },
      { id: "co", label: "Carbon monoxide checked", reading: "ppm" },
      { id: "venting", label: "Venting and flue clear" },
      { id: "temp_rise", label: "Temperature rise", reading: "°F" },
      LEFT_RUNNING,
    ],
  },
  hvac_tune_up: {
    id: "hvac_tune_up",
    title: "Tune-up",
    items: [
      { id: "thermostat", label: "Thermostat tested in heat and cool" },
      { id: "filter", label: "Air filter replaced", reading: "Size" },
      { id: "electrical", label: "Electrical connections tightened" },
      { id: "capacitor", label: "Capacitor tested", reading: "µF" },
      { id: "pressures", label: "Refrigerant pressures recorded", reading: "Suction / head psi" },
      { id: "coil", label: "Outdoor coil rinsed" },
      { id: "condensate", label: "Condensate drain flushed" },
      { id: "burners", label: "Burners and flame sensor cleaned" },
      { id: "co", label: "Carbon monoxide checked", reading: "ppm" },
      { id: "blower", label: "Blower wheel and motor checked" },
      LEFT_RUNNING,
    ],
  },
  hvac_install: {
    id: "hvac_install",
    title: "Install",
    items: [
      { id: "model_serial", label: "Model and serial numbers recorded", reading: "Model / serial" },
      { id: "pad_level", label: "Equipment level and secured" },
      { id: "line_set", label: "Line set pressure tested", reading: "psi held" },
      { id: "vacuum", label: "Evacuated to microns", reading: "Microns" },
      { id: "charge", label: "Charge verified", reading: "Subcool / superheat" },
      { id: "electrical", label: "Disconnect, wire size and breaker match the nameplate" },
      { id: "drain", label: "Condensate drain and safety switch installed" },
      { id: "thermostat", label: "Thermostat programmed" },
      { id: "permit", label: "Permit sticker or number", reading: "Permit #" },
      CLEAN_UP,
      LEFT_RUNNING,
    ],
  },
  hvac_general: {
    id: "hvac_general",
    title: "HVAC visit",
    items: [
      { id: "thermostat", label: "Thermostat checked" },
      { id: "filter", label: "Air filter checked or replaced" },
      { id: "cause", label: "Cause found and explained to the customer" },
      { id: "tested", label: "System tested after the repair" },
      CLEAN_UP,
      LEFT_RUNNING,
    ],
  },
  plumb_water_heater: {
    id: "plumb_water_heater",
    title: "Water heater",
    items: [
      { id: "model_serial", label: "Model, serial and age recorded", reading: "Model / year" },
      { id: "shutoffs", label: "Water and gas or power shut off before work" },
      { id: "tp_valve", label: "Pressure relief valve and discharge pipe checked" },
      { id: "venting", label: "Venting checked (gas)" },
      { id: "co", label: "Carbon monoxide checked (gas)", reading: "ppm" },
      { id: "leaks", label: "No leaks at connections after 5 minutes" },
      { id: "temperature", label: "Water temperature", reading: "°F" },
      CLEAN_UP,
    ],
  },
  plumb_drain: {
    id: "plumb_drain",
    title: "Drain or sewer",
    items: [
      { id: "access", label: "Cleanout or access point used", reading: "Where" },
      { id: "cause", label: "Blockage cause found", reading: "Roots, grease, wipes…" },
      { id: "flow", label: "Flow tested at the fixture after clearing" },
      { id: "camera", label: "Camera inspection offered or done" },
      CLEAN_UP,
    ],
  },
  plumb_gas: {
    id: "plumb_gas",
    title: "Gas line",
    items: [
      { id: "gas_off", label: "Gas shut off before work" },
      { id: "leak_test", label: "Leak test passed on every joint" },
      { id: "pressure", label: "Line pressure held", reading: "psi / minutes" },
      { id: "relight", label: "Appliances relit and checked" },
      { id: "co", label: "Carbon monoxide checked", reading: "ppm" },
      CLEAN_UP,
    ],
  },
  plumb_general: {
    id: "plumb_general",
    title: "Plumbing visit",
    items: [
      { id: "shutoff", label: "Water shut-off located and working" },
      { id: "cause", label: "Leak or problem source found" },
      { id: "tested", label: "Fixtures tested after the repair" },
      { id: "leaks", label: "No leaks at joints after 5 minutes" },
      { id: "pressure", label: "Water pressure", reading: "psi" },
      CLEAN_UP,
    ],
  },
  elec_panel: {
    id: "elec_panel",
    title: "Panel or charger",
    items: [
      { id: "dead", label: "Power off and tested dead before work" },
      { id: "load", label: "Load calculation done", reading: "Amps" },
      { id: "wire_breaker", label: "Wire size matches breaker size" },
      { id: "torque", label: "Connections torqued to spec" },
      { id: "grounding", label: "Grounding and bonding checked" },
      { id: "labels", label: "Panel directory labeled" },
      { id: "afci_gfci", label: "AFCI and GFCI protection where required" },
      { id: "permit", label: "Permit number", reading: "Permit #" },
      { id: "energized", label: "Energized and tested under load" },
      CLEAN_UP,
    ],
  },
  elec_general: {
    id: "elec_general",
    title: "Electrical visit",
    items: [
      { id: "dead", label: "Power off and tested dead before work" },
      { id: "cause", label: "Cause found and explained to the customer" },
      { id: "connections", label: "Connections tight and covered" },
      { id: "gfci", label: "GFCI tested where required" },
      { id: "energized", label: "Circuit tested under load after the repair" },
      CLEAN_UP,
    ],
  },
  general: {
    id: "general",
    title: "Visit",
    items: [
      { id: "problem", label: "Problem confirmed with the customer" },
      { id: "explained", label: "Work and price explained before starting" },
      { id: "tested", label: "Tested after the work" },
      CLEAN_UP,
      { id: "walkthrough", label: "Customer walked through what was done" },
    ],
  },
};

const BY_CATEGORY: Record<string, string> = {
  "hvac.no_cool": "hvac_cooling",
  "hvac.condensate": "hvac_cooling",
  "hvac.airflow": "hvac_cooling",
  "hvac.no_heat": "hvac_heating",
  "hvac.maintenance": "hvac_tune_up",
  "hvac.system_replace": "hvac_install",
  "plumb.water_heater": "plumb_water_heater",
  "plumb.drain_clog": "plumb_drain",
  "plumb.sewer": "plumb_drain",
  "plumb.gas": "plumb_gas",
  "elec.panel": "elec_panel",
  "elec.ev_charger": "elec_panel",
};

const BY_PREFIX: Array<[string, string]> = [
  ["hvac.", "hvac_general"],
  ["plumb.", "plumb_general"],
  ["elec.", "elec_general"],
];

const BY_TRADE: Partial<Record<Trade, string>> = { HVAC: "hvac_general", Plumbing: "plumb_general", Electrical: "elec_general" };

/** The template for a job: its category when known, else what its title reads as, else the shop's trade. */
export function checklistTemplateFor(job: { categoryCode?: string | null; title?: string | null; serviceType?: string | null }, trade?: string | null): ChecklistTemplate {
  const code = job.categoryCode || classifyDemand({ text: [job.title, job.serviceType].filter(Boolean).join(" "), trade: (trade as Trade) ?? null });
  const id = (code && (BY_CATEGORY[code] ?? BY_PREFIX.find(([p]) => code.startsWith(p))?.[1])) || (trade && BY_TRADE[trade as Trade]) || "general";
  return CHECKLIST_TEMPLATES[id] ?? CHECKLIST_TEMPLATES.general;
}

type Stored = { templateId: string; title: string; items: ChecklistItem[] };

function parseStored(raw: string | null | undefined): Stored | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Stored;
    if (!v || typeof v.templateId !== "string" || !Array.isArray(v.items)) return null;
    return v;
  } catch {
    return null;
  }
}

function fromTemplate(t: ChecklistTemplate): Stored {
  return { templateId: t.id, title: t.title, items: t.items.map((i) => ({ ...i, done: false, value: null, at: null })) };
}

function withCounts(s: Stored): JobChecklist {
  return { ...s, done: s.items.filter((i) => i.done).length, total: s.items.length };
}

/** The job's saved checklist, or a fresh one from its template. */
export function readChecklist(raw: string | null | undefined, template: ChecklistTemplate): JobChecklist {
  return withCounts(parseStored(raw) ?? fromTemplate(template));
}

/**
 * Apply the technician's ticks and readings to the saved copy. Unknown items
 * are ignored, so a stale phone can't add rows; each tick keeps the time it
 * first happened, so a replay from an offline phone doesn't move it.
 */
export function applyChecklist(raw: string | null | undefined, template: ChecklistTemplate, changes: unknown, now = new Date()): { json: string; checklist: JobChecklist } {
  const current = parseStored(raw) ?? fromTemplate(template);
  const list = Array.isArray(changes) ? changes : [];
  const byId = new Map<string, { done?: unknown; value?: unknown; at?: unknown }>();
  for (const c of list.slice(0, 100)) if (c && typeof c === "object" && typeof (c as { id?: unknown }).id === "string") byId.set((c as { id: string }).id, c);
  const items = current.items.map((item) => {
    const c = byId.get(item.id);
    if (!c) return item;
    const done = typeof c.done === "boolean" ? c.done : item.done;
    const value = typeof c.value === "string" ? c.value.trim().slice(0, 80) || null : item.value;
    const claimed = typeof c.at === "string" ? new Date(c.at) : null;
    const when = claimed && !Number.isNaN(claimed.getTime()) && claimed <= now && now.getTime() - claimed.getTime() < 7 * 86_400_000 ? claimed : now;
    return { ...item, done, value, at: done ? (item.done && item.at ? item.at : when.toISOString()) : null };
  });
  const next = { ...current, items };
  return { json: JSON.stringify(next), checklist: withCounts(next) };
}
