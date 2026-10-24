/** A short fact the caller said. A bare dollar amount is dropped, because this field is not a price. */
export function spokenEquipmentFact(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const text = value.trim().replace(/\s+/g, " ").slice(0, 80);
  if (text.length < 2) return undefined;
  if (/^\$?\d[\d,]*(?:\.\d{1,2})?(?:\s*(?:dollars|bucks))?$/i.test(text)) return undefined;
  return text;
}

export function equipmentLine(input: {
  systemType?: string | null;
  equipmentBrand?: string | null;
  equipmentModel?: string | null;
}): string | null {
  const parts = [input.systemType, input.equipmentBrand, input.equipmentModel].map((part) => part?.trim()).filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
