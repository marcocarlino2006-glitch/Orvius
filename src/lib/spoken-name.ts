/** Internal stamps from a drill are not something to read to the owner. */
export function ownerNote(note: string | null | undefined): string | null {
  const text = (note ?? "").trim();
  if (!text || /partial data|automated drill/i.test(text)) return null;
  return text;
}

/** A drill labels sample people with "Sim ". That prefix is not their name. */
export function spokenName(name: string | null | undefined): string {
  return spokenText(name).trim();
}

/** The same label, anywhere in a sentence the owner reads. */
export function spokenText(text: string | null | undefined): string {
  return (text ?? "").replace(/\bSim\s+/g, "");
}

export function spokenPhone(phone: string | null | undefined): string {
  const raw = (phone ?? "").trim();
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)} ${digits.slice(4, 7)} ${digits.slice(7)}`;
  }
  return raw;
}

/** A real name, otherwise the number on the record. Never a stand-in person. */
export function personLabel(name: string | null | undefined, phone?: string | null): string {
  const spoken = spokenName(name);
  if (spoken) return spoken;
  const number = spokenPhone(phone);
  if (number) return number;
  return "No name on file";
}
