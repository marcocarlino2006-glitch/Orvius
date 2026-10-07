/** Set by middleware on GET and HEAD API requests; a locked shop may read but not write. */
export const LOCKED_READ_HEADER = "x-orvius-locked-read";
