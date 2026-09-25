export type ChangelogEntry = {
  /** ISO date (YYYY-MM-DD) the change shipped. */
  date: string;
  title: string;
  items: string[];
};

/**
 * Public changelog, newest first. Every line maps to a shipped commit — no
 * roadmap, no "coming soon". If it is not in the product, it is not here.
 */
export const CHANGELOG: readonly ChangelogEntry[] = [
  {
    date: "2026-09-25",
    title: "Books on the call, live Command, alerts on your phone",
    items: [
      "The receptionist checks your real schedule during the call, offers the caller open times, and holds the one they pick so two callers can't take the same slot.",
      "Returning callers are recognized: the receptionist gets a private note with their history when the call connects.",
      "Pick the receptionist's voice in Settings.",
      "Command updates on its own when a call, lead, or job changes — no refresh.",
      "Install Orvius on your phone's home screen and turn on push alerts in Settings → Notifications.",
      "Keyboard shortcuts across the app — press ? to see them.",
      "Command opens with a brief for you: what changed since you last looked and what still needs you.",
      "Public status page and this changelog.",
    ],
  },
  {
    date: "2026-09-25",
    title: "Safer calls and clearer owner texts",
    items: [
      "Urgency and safety are classified from what the caller said, including Spanish and heat-wave calls; gas-smell callers are told to get outside first.",
      "No new job is booked when someone calls about work that's already booked or calls back about the same problem.",
      "Complaints about past visits are held for you, and callback numbers that differ from caller ID are flagged.",
      "Callers who ask for a person are transferred to your phone when you set a transfer number in Settings; otherwise you get a callback alert.",
      "Owner texts say what the call was about, skip spam, flag anything the receptionist promised, and use your time zone.",
    ],
  },
  {
    date: "2026-09-24",
    title: "Command, Ask, and call review",
    items: [
      "Every call is graded on capture, safety, outcome, and friction; calls worth a listen are surfaced.",
      "Ask answers from your own records, cites them, and rejects answers that invent facts.",
      "Autopilot handles routine confirmations and clear-cut assignments, so the queue shows only decisions that need you.",
      "Jobs sync to Google, Apple, and Outlook calendars from a link in Settings → Integrations.",
      "Settings is one panel with save-as-you-go rows.",
    ],
  },
];
