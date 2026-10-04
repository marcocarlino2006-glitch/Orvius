export const SETTINGS_SECTIONS = [
  { id: "account", label: "Account", group: "account" },
  { id: "billing", label: "Usage & Billing", group: "account" },
  { id: "general", label: "General", group: "settings" },
  { id: "notifications", label: "Notifications", group: "settings" },
  { id: "hours", label: "Hours & area", group: "settings" },
  { id: "receptionist", label: "Personalization", group: "capabilities" },
  { id: "phone", label: "Phone line", group: "capabilities" },
  { id: "team", label: "Team", group: "capabilities" },
  { id: "business", label: "Business", group: "assets" },
  { id: "data", label: "Data controls", group: "data" },
  { id: "integrations", label: "Integrations", group: "data" },
  { id: "performance", label: "Performance", group: "data" },
  { id: "internal", label: "Internal", group: "founder" },
] as const;

export type SettingsSectionId = (typeof SETTINGS_SECTIONS)[number]["id"];

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
