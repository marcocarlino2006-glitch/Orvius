/** Extra addresses and equipment on a customer — the record a shop cannot leave. */

export type ExtraAddress = { label: string; line: string };
export type Equipment = { name: string; brand: string; model: string; notes: string };

const MAX_ADDRESSES = 8;
const MAX_EQUIPMENT = 20;
const MAX_LINE = 200;

function clip(value: unknown, fallback = "") {
  return String(value ?? "")
    .trim()
    .slice(0, MAX_LINE);
}

export function parseAddresses(raw: string | null | undefined): ExtraAddress[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({ label: clip(row?.label) || "Other", line: clip(row?.line) }))
      .filter((row) => row.line)
      .slice(0, MAX_ADDRESSES);
  } catch {
    return [];
  }
}

export function parseEquipment(raw: string | null | undefined): Equipment[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row) => ({
        name: clip(row?.name),
        brand: clip(row?.brand),
        model: clip(row?.model),
        notes: clip(row?.notes),
      }))
      .filter((row) => row.name)
      .slice(0, MAX_EQUIPMENT);
  } catch {
    return [];
  }
}

export function serializeAddresses(rows: ExtraAddress[]) {
  return JSON.stringify(parseAddresses(JSON.stringify(rows)));
}

export function serializeEquipment(rows: Equipment[]) {
  return JSON.stringify(parseEquipment(JSON.stringify(rows)));
}
