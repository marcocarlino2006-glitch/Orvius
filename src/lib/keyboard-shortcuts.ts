export const SHOW_SHORTCUTS_EVENT = "orvius:shortcuts";

/** "g" then a letter jumps to a screen, like Gmail and Linear. */
export const GO_TO: Array<{ key: string; href: string; label: string }> = [
  { key: "c", href: "/dashboard", label: "Command" },
  { key: "i", href: "/dashboard/inbox", label: "Inbox" },
  { key: "l", href: "/dashboard/calls", label: "Calls" },
  { key: "u", href: "/dashboard/customers", label: "Customers" },
  { key: "j", href: "/dashboard/jobs", label: "Jobs" },
  { key: "d", href: "/dashboard/dispatch", label: "Dispatch" },
  { key: "a", href: "/dashboard/ask", label: "Ask" },
  { key: "s", href: "/dashboard/settings", label: "Settings" },
];

export const SHORTCUT_GROUPS: Array<{ title: string; items: Array<{ keys: string[]; label: string }> }> = [
  {
    title: "Anywhere",
    items: [
      { keys: ["⌘", "K"], label: "Search callers, customers and jobs" },
      { keys: ["⌘", "J"], label: "Ask about your shop" },
      { keys: ["?"], label: "Show these shortcuts" },
      { keys: ["Esc"], label: "Close" },
    ],
  },
  { title: "Go to", items: GO_TO.map((item) => ({ keys: ["G", item.key.toUpperCase()], label: item.label })) },
];

/** Typing in a field must never trigger a shortcut. */
export function isTypingTarget(target: EventTarget | null): boolean {
  if (!target || typeof (target as HTMLElement).tagName !== "string") return false;
  const el = target as HTMLElement;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable === true;
}

/** Resolves the second key of a "g" sequence, or null. */
export function goToHref(key: string): string | null {
  return GO_TO.find((item) => item.key === key.toLowerCase())?.href ?? null;
}
