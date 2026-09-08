/**
 * Search filters for the command palette.
 *
 * Every filter is built here so there is one place where the shop id is
 * stamped on, and one place a test can prove it. A palette query must never be
 * able to reach another shop's records, whatever the operator types.
 *
 * No imports on purpose: this is used by the route and by a plain node test.
 */

type Contains = { contains: string };

export type SearchFilters = {
  lead: {
    businessId: string;
    OR: Array<{ name?: Contains; serviceType?: Contains; phone?: Contains }>;
  };
  customer: {
    businessId: string;
    OR: Array<{ name?: Contains; phone?: Contains }>;
  };
  job: {
    businessId: string;
    OR: Array<{ title?: Contains; address?: Contains }>;
  };
};

/** Shortest query worth a database round trip. */
export const MIN_QUERY_LENGTH = 2;

/** Digits needed before a query is treated as part of a phone number. */
const MIN_PHONE_DIGITS = 4;

/**
 * Returns null when the query is too short to match anything useful, so the
 * caller can answer with an empty result instead of scanning the table.
 */
export function buildSearchFilters(
  businessId: string,
  rawQuery: string,
): SearchFilters | null {
  const q = rawQuery.trim();
  if (!businessId || q.length < MIN_QUERY_LENGTH) return null;

  const digits = q.replace(/[^0-9]/g, "");
  const phone = digits.length >= MIN_PHONE_DIGITS ? { contains: digits } : null;

  return {
    lead: {
      businessId,
      OR: [
        { name: { contains: q } },
        { serviceType: { contains: q } },
        ...(phone ? [{ phone }] : []),
      ],
    },
    customer: {
      businessId,
      OR: [{ name: { contains: q } }, ...(phone ? [{ phone }] : [])],
    },
    job: {
      businessId,
      OR: [{ title: { contains: q } }, { address: { contains: q } }],
    },
  };
}
