export const SETTINGS_SECTIONS = [
  { id: "account", label: "Account", group: "you" },
  { id: "business", label: "Business", group: "shop" },
  { id: "phone", label: "Phone line", group: "shop" },
  { id: "hours", label: "Hours & area", group: "shop" },
  { id: "receptionist", label: "Receptionist", group: "shop" },
  { id: "notifications", label: "Notifications", group: "shop" },
  { id: "team", label: "Team", group: "shop" },
  { id: "integrations", label: "Integrations", group: "workspace" },
  { id: "billing", label: "Billing", group: "workspace" },
  { id: "performance", label: "Performance", group: "workspace" },
  { id: "data", label: "Data controls", group: "workspace" },
  { id: "internal", label: "Internal", group: "founder" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** Every setting an owner can look for, with the words they might type instead of ours. */
export const SETTINGS_SEARCH: Array<{ label: string; section: SettingsSectionId; keywords?: string }> = [
  { label: "Name and email", section: "account", keywords: "profile sign in login" },
  { label: "Setup checklist", section: "account", keywords: "getting started onboarding progress" },
  { label: "Business name", section: "business", keywords: "shop company rename" },
  { label: "Trade", section: "business", keywords: "hvac plumbing electrical industry" },
  { label: "Shop address", section: "business", keywords: "location" },
  { label: "Your Orvius line", section: "phone", keywords: "phone number" },
  { label: "Forwarding", section: "phone", keywords: "call forward carrier verizon att t-mobile missed calls" },
  { label: "Open hours", section: "hours", keywords: "schedule after hours weekend" },
  { label: "Services", section: "hours", keywords: "work you take jobs" },
  { label: "Service ZIPs", section: "hours", keywords: "area zip codes coverage" },
  { label: "Opening line", section: "receptionist", keywords: "greeting first thing callers hear" },
  { label: "Voice", section: "receptionist", keywords: "receptionist sound male female" },
  { label: "Connect callers who ask for a person", section: "receptionist", keywords: "transfer human live person" },
  { label: "Handle routine work", section: "receptionist", keywords: "autopilot automatic confirm assign" },
  { label: "Average ticket", section: "receptionist", keywords: "job value numbers" },
  { label: "Your mobile", section: "notifications", keywords: "phone alerts cell" },
  { label: "Text alerts", section: "notifications", keywords: "sms lead alerts" },
  { label: "Email backup", section: "notifications", keywords: "email alerts" },
  { label: "Push alerts on this device", section: "notifications", keywords: "notifications browser app" },
  { label: "Send a test alert", section: "notifications", keywords: "test" },
  { label: "People with access", section: "team", keywords: "invite teammates users roles permissions manager dispatcher office staff access seats" },
  { label: "Technicians", section: "team", keywords: "crew staff techs team members" },
  { label: "Stripe", section: "integrations", keywords: "payments card connect" },
  { label: "Busy times", section: "integrations", keywords: "block busy calendar ical icloud outlook personal" },
  { label: "Jobs calendar feed", section: "integrations", keywords: "ical subscribe calendar google apple outlook sync" },
  { label: "Plan and billing", section: "billing", keywords: "subscription payment card invoice upgrade cancel" },
  { label: "Deposits and payouts", section: "billing", keywords: "stripe money bank" },
  { label: "Performance", section: "performance", keywords: "metrics results stats" },
  { label: "Export shop data", section: "data", keywords: "download backup csv" },
  { label: "Delete workspace", section: "data", keywords: "danger close account remove" },
];

export function searchSettings(query: string) {
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  return SETTINGS_SEARCH.filter((item) => {
    const hay = `${item.label} ${item.keywords ?? ""}`.toLowerCase();
    return terms.every((term) => hay.includes(term));
  });
}

const SECTION_IDS = new Set<string>(SETTINGS_SECTIONS.map((s) => s.id));

/** Old in-page anchors still used by alerts, the setup checklist, and the work queue. */
const LEGACY_ANCHORS: Record<string, SettingsSectionId> = {
  "shop-profile": "business",
  "overflow-forward": "phone",
  "hours-services": "hours",
  "economics-baseline": "receptionist",
  "owner-alerts": "notifications",
  "email-failover": "notifications",
  integrations: "integrations",
  "operating-metrics": "performance",
  "shop-data": "data",
  "founder-cert": "internal",
  "manus-post-next": "internal",
};

export const SETTINGS_EVENT = "orvius:settings";
export const SETTINGS_PARAM = "settings";

export function isSettingsSection(value: string | null | undefined): value is SettingsSectionId {
  return Boolean(value && SECTION_IDS.has(value));
}

export function sectionFromAnchor(anchor: string | null | undefined): SettingsSectionId {
  const key = (anchor ?? "").replace(/^#/, "");
  if (isSettingsSection(key)) return key;
  return LEGACY_ANCHORS[key] ?? "account";
}

/**
 * Maps an in-app href to the settings section it opens, or null when the href
 * is not a settings destination. Billing keeps its own page for Stripe returns.
 */
export function settingsSectionForHref(href: string): SettingsSectionId | null {
  let url: URL;
  try {
    url = new URL(href, "http://orvius.local");
  } catch {
    return null;
  }
  if (url.origin !== "http://orvius.local") return null;
  if (url.pathname === "/dashboard/profile") return "account";
  if (url.pathname !== "/dashboard/settings") {
    const param = url.searchParams.get(SETTINGS_PARAM);
    return isSettingsSection(param) ? param : null;
  }
  const param = url.searchParams.get(SETTINGS_PARAM);
  if (isSettingsSection(param)) return param;
  return url.hash ? sectionFromAnchor(url.hash) : "business";
}

export function openSettings(section: SettingsSectionId = "account") {
  window.dispatchEvent(new CustomEvent(SETTINGS_EVENT, { detail: section }));
}
