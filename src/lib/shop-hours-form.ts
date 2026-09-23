import {
  parseJson,
  type BusinessHours,
  type ServiceOffering,
} from "@/lib/business";
import { parseServiceZips, serializeServiceZips } from "@/lib/service-area";

export const WEEKDAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;

export type Weekday = (typeof WEEKDAYS)[number];

export type DayHoursForm = {
  open: string;
  close: string;
  closed: boolean;
};

export type HoursForm = Record<Weekday, DayHoursForm>;

const FALLBACK: BusinessHours = {
  monday: { open: "08:00", close: "18:00" },
  tuesday: { open: "08:00", close: "18:00" },
  wednesday: { open: "08:00", close: "18:00" },
  thursday: { open: "08:00", close: "18:00" },
  friday: { open: "08:00", close: "18:00" },
  saturday: { open: "09:00", close: "14:00" },
  sunday: { closed: true, open: "00:00", close: "00:00" },
};

function dayFromEntry(
  entry: { open?: string; close?: string; closed?: boolean } | undefined,
  fallback: DayHoursForm,
): DayHoursForm {
  if (!entry) return { ...fallback };
  return {
    open: entry.open ?? fallback.open,
    close: entry.close ?? fallback.close,
    closed: Boolean(entry.closed),
  };
}

export function parseHoursForm(raw: string | null | undefined): HoursForm {
  const parsed = parseJson<BusinessHours>(raw ?? "", {});
  const form = {} as HoursForm;
  for (const day of WEEKDAYS) {
    const fb = FALLBACK[day] ?? { open: "08:00", close: "18:00", closed: false };
    form[day] = dayFromEntry(parsed[day], {
      open: fb.open ?? "08:00",
      close: fb.close ?? "18:00",
      closed: Boolean(fb.closed),
    });
  }
  return form;
}

export function serializeHoursForm(form: HoursForm): string {
  const out: BusinessHours = {};
  for (const day of WEEKDAYS) {
    const entry = form[day];
    out[day] = entry.closed
      ? { open: entry.open || "00:00", close: entry.close || "00:00", closed: true }
      : { open: entry.open || "08:00", close: entry.close || "18:00" };
  }
  return JSON.stringify(out);
}

export function parseServicesForm(raw: string | null | undefined): string {
  const services = parseJson<ServiceOffering[]>(raw ?? "", []);
  if (!Array.isArray(services) || services.length === 0) return "";
  return services
    .map((s) => (typeof s?.name === "string" ? s.name.trim() : ""))
    .filter(Boolean)
    .join("\n");
}

export function serializeServicesForm(text: string): string {
  const names = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const services: ServiceOffering[] = names.map((name) => ({ name }));
  return JSON.stringify(services);
}

export function parseZipsForm(raw: string | null | undefined): string {
  return parseServiceZips(raw).join(", ");
}

export function serializeZipsForm(text: string): string {
  const parts = text
    .split(/[\s,;]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return serializeServiceZips(parts);
}

export function weekdayLabel(day: Weekday): string {
  return day.charAt(0).toUpperCase() + day.slice(1);
}
