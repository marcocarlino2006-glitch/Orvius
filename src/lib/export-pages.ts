/* Largest collections come in pages so one file can't time out; the file says when there is more. */
export const EXPORT_PAGE = { leads: 5000, jobs: 5000, auditEvents: 20000 } as const;
