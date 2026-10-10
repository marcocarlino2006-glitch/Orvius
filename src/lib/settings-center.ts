/**
 * Settings answer "how is Orvius allowed to run?", in five groups: the
 * business it serves, what it is connected to, what it may do alone, when it
 * hands off to a person, and the account itself.
 */
export const SETTINGS_SECTIONS = [
  { id: "business", label: "Business profile", group: "business" },
  { id: "hours", label: "Hours, services & area", nav: "Hours & services", group: "business" },
  { id: "phone", label: "Connect your number", nav: "Phone number", group: "connections" },
  { id: "integrations", label: "Calendar, payments & texting", nav: "Integrations", group: "connections" },
  { id: "receptionist", label: "What Orvius may do", group: "authority" },
  { id: "notifications", label: "Alerts & escalation", group: "escalation" },
  { id: "account", label: "Profile & security", group: "account" },
  { id: "general", label: "Preferences", group: "account" },
  { id: "team", label: "Team access", group: "account" },
  { id: "billing", label: "Billing", group: "account" },
  { id: "performance", label: "Performance", group: "account" },
  { id: "activity", label: "Activity log", group: "account" },
  { id: "data", label: "Data controls", group: "account" },
  { id: "internal", label: "Internal", group: "founder" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

/** The rail name: one line at the rail's width. The page title keeps the full label. */
export function settingsNavLabel(section: (typeof SETTINGS_SECTIONS)[number]): string {
  return "nav" in section ? section.nav : section.label;
}

/** Every setting an owner can look for, with the words they might type instead of ours. */
export const SETTINGS_SEARCH: Array<{ label: string; section: SettingsSectionId; keywords?: string }> = [
  { label: "Name and email", section: "account", keywords: "profile sign in login" },
  { label: "Setup checklist", section: "account", keywords: "getting started onboarding progress" },
  { label: "Business name", section: "business", keywords: "shop company rename" },
  { label: "Business type", section: "business", keywords: "trade industry hvac plumbing electrical salon law auto real estate" },
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
  { label: "Activity log", section: "activity", keywords: "audit trail history who changed log compliance security events" },
  { label: "Download activity CSV", section: "activity", keywords: "audit export csv compliance" },
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
