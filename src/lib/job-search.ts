import type { Prisma } from "@prisma/client";

export const JOB_SEARCH_LIMIT = 100;
export const CLOSED_PAGE = 60;
export const CLOSED_STATUSES = ["completed", "cancelled"];

/**
 * A search over every job the shop has ever had, not the ones the board
 * happened to load: a customer calling about last spring's install is found.
 * Phone numbers match on their digits however they were typed.
 */
export function jobSearchWhere(businessId: string, raw: string): Prisma.JobWhereInput | null {
  const q = raw.trim().slice(0, 80);
  if (q.length < 2) return null;
  const digits = q.replace(/\D/g, "");
  const text: Prisma.JobWhereInput[] = [
    { title: { contains: q } },
    { serviceType: { contains: q } },
    { address: { contains: q } },
    { customer: { name: { contains: q } } },
    { lead: { name: { contains: q } } },
    { technician: { name: { contains: q } } },
  ];
  if (digits.length >= 3) {
    text.push({ customer: { phone: { contains: digits } } }, { lead: { phone: { contains: digits } } });
  }
  return { businessId, OR: text };
}

/** Closed jobs page newest-first by when they closed; the cursor is the last row's updatedAt and id. */
export function closedPageWhere(businessId: string, before: string | null): Prisma.JobWhereInput {
  const base: Prisma.JobWhereInput = { businessId, status: { in: CLOSED_STATUSES } };
  const cursor = before ? parseClosedCursor(before) : null;
  if (!cursor) return base;
  return {
    ...base,
    OR: [{ updatedAt: { lt: cursor.at } }, { updatedAt: cursor.at, id: { lt: cursor.id } }],
  };
}

export function closedCursor(row: { updatedAt: Date; id: string }): string {
  return `${row.updatedAt.toISOString()}_${row.id}`;
}

export function parseClosedCursor(value: string): { at: Date; id: string } | null {
  const split = value.indexOf("_");
  if (split < 1) return null;
  const at = new Date(value.slice(0, split));
  const id = value.slice(split + 1);
  return Number.isNaN(at.getTime()) || !id ? null : { at, id };
}
