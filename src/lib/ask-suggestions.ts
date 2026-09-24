/** Shared Ask chips — dock and full page must speak the same next moves. */
export const ASK_SUGGESTIONS = [
  "What should I do now?",
  "What happened overnight?",
  "How many jobs did we book this week?",
  "What's unassigned on dispatch?",
  "Any emergencies in the inbox?",
  "Which customers are waiting on a callback?",
] as const;

/** Compact dock list — lead with the same next-gate question. */
export const ASK_DOCK_SUGGESTIONS = ASK_SUGGESTIONS.slice(0, 3);
