/** Parse prospect CSV for Admin import — wedge distribution machine. */

export type ProspectImportRow = {
  email: string;
  businessName: string | null;
  phone: string | null;
  trade: string | null;
  city: string | null;
};

export type ProspectParseResult = {
  rows: ProspectImportRow[];
  errors: string[];
  skipped: number;
};

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (ch === "," && !inQuotes) {
      out.push(cur.trim());
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur.trim());
  return out;
}

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/[\s_]+/g, "");
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Expected headers (any order): email, businessName|business|name, phone, trade, city
 */
export function parseProspectCsv(text: string): ProspectParseResult {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length === 0) {
    return { rows: [], errors: ["Empty file"], skipped: 0 };
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  const idx = {
    email: headers.findIndex((h) => h === "email"),
    business: headers.findIndex((h) =>
      ["businessname", "business", "name", "company"].includes(h),
    ),
    phone: headers.findIndex((h) => h === "phone" || h === "mobile"),
    trade: headers.findIndex((h) => h === "trade" || h === "industry"),
    city: headers.findIndex((h) => h === "city" || h === "market"),
  };

  if (idx.email === -1) {
    return {
      rows: [],
      errors: ["CSV must include an email column"],
      skipped: 0,
    };
  }

  const rows: ProspectImportRow[] = [];
  const errors: string[] = [];
  const seen = new Set<string>();
  let skipped = 0;

  for (let i = 1; i < lines.length; i++) {
    const cols = splitCsvLine(lines[i]);
    const email = (cols[idx.email] ?? "").trim().toLowerCase();
    if (!email) {
      skipped++;
      continue;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push(`Row ${i + 1}: invalid email "${email}"`);
      skipped++;
      continue;
    }
    if (seen.has(email)) {
      skipped++;
      continue;
    }
    seen.add(email);
    rows.push({
      email,
      businessName:
        idx.business >= 0 ? cols[idx.business]?.trim() || null : null,
      phone: idx.phone >= 0 ? cols[idx.phone]?.trim() || null : null,
      trade: idx.trade >= 0 ? cols[idx.trade]?.trim() || null : null,
      city: idx.city >= 0 ? cols[idx.city]?.trim() || null : null,
    });
  }

  return { rows, errors, skipped };
}
