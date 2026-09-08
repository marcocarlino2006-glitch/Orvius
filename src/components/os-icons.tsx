/**
 * Sidebar glyphs — one 24-grid, 1.6 stroke, currentColor. Kept inline so the
 * nav has no runtime icon dependency and inherits nav link color/opacity.
 */

export type OsIconName =
  | "command"
  | "inbox"
  | "calls"
  | "customers"
  | "jobs"
  | "dispatch"
  | "copilot"
  | "settings"
  | "profile"
  | "billing";

const PATHS: Record<OsIconName, React.ReactNode> = {
  command: (
    <>
      <rect x="3" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="3" width="7.5" height="7.5" rx="1.5" />
      <rect x="3" y="13.5" width="7.5" height="7.5" rx="1.5" />
      <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.5" />
    </>
  ),
  inbox: (
    <>
      <path d="M3 13h4l1.6 2.6h6.8L17 13h4" />
      <path d="M5.6 5.2 3 11v6.4A1.6 1.6 0 0 0 4.6 19h14.8a1.6 1.6 0 0 0 1.6-1.6V11l-2.6-5.8A1.6 1.6 0 0 0 16.9 4H7.1a1.6 1.6 0 0 0-1.5 1.2Z" />
    </>
  ),
  calls: (
    <path d="M20.5 16.4v2.3a1.7 1.7 0 0 1-1.9 1.7 17 17 0 0 1-7.4-2.6 16.7 16.7 0 0 1-5.1-5.1A17 17 0 0 1 3.5 5.3 1.7 1.7 0 0 1 5.2 3.5h2.3a1.7 1.7 0 0 1 1.7 1.5c.1.8.3 1.6.6 2.4a1.7 1.7 0 0 1-.4 1.8l-1 1a14 14 0 0 0 5.1 5.1l1-1a1.7 1.7 0 0 1 1.8-.4c.8.3 1.6.5 2.4.6a1.7 1.7 0 0 1 1.5 1.7Z" />
  ),
  customers: (
    <>
      <path d="M15.5 20.5v-1.7a3.4 3.4 0 0 0-3.4-3.4H6.9a3.4 3.4 0 0 0-3.4 3.4v1.7" />
      <circle cx="9.5" cy="8" r="3.5" />
      <path d="M20.5 20.5v-1.7a3.4 3.4 0 0 0-2.6-3.3" />
      <path d="M15.8 4.7a3.4 3.4 0 0 1 0 6.6" />
    </>
  ),
  jobs: (
    <>
      <path d="M15.5 4.5H17A1.8 1.8 0 0 1 18.8 6.3v12.4A1.8 1.8 0 0 1 17 20.5H7A1.8 1.8 0 0 1 5.2 18.7V6.3A1.8 1.8 0 0 1 7 4.5h1.5" />
      <rect x="8.5" y="2.8" width="7" height="3.6" rx="1.2" />
      <path d="m9.4 13.4 1.9 1.9 3.6-3.8" />
    </>
  ),
  dispatch: (
    <>
      <path d="M19.5 10.3c0 5.4-7.5 10.9-7.5 10.9S4.5 15.7 4.5 10.3a7.5 7.5 0 0 1 15 0Z" />
      <circle cx="12" cy="10.1" r="2.6" />
    </>
  ),
  copilot: (
    <>
      <path d="M12 3.2l1.75 4.3 4.3 1.75-4.3 1.75L12 15.3l-1.75-4.3L5.95 9.25l4.3-1.75L12 3.2Z" />
      <path d="M18.4 15.6l.7 1.75 1.75.7-1.75.7-.7 1.75-.7-1.75-1.75-.7 1.75-.7.7-1.75Z" />
    </>
  ),
  settings: (
    <>
      <path d="M4 6.5h5.2M13.8 6.5H20M4 12h2.2M10.8 12H20M4 17.5h7.2M15.8 17.5H20" />
      <circle cx="11.5" cy="6.5" r="2.3" />
      <circle cx="8.5" cy="12" r="2.3" />
      <circle cx="13.5" cy="17.5" r="2.3" />
    </>
  ),
  profile: (
    <>
      <path d="M19 20.5v-1.9a3.6 3.6 0 0 0-3.6-3.6H8.6A3.6 3.6 0 0 0 5 18.6v1.9" />
      <circle cx="12" cy="7.6" r="3.9" />
    </>
  ),
  billing: (
    <>
      <rect x="2.8" y="5.2" width="18.4" height="13.6" rx="2" />
      <path d="M2.8 10.2h18.4" />
      <path d="M6.4 14.6h3.2" />
    </>
  ),
};

export function OsIcon({ name }: { name: OsIconName }) {
  return (
    <svg
      className="os-nav-icon"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {PATHS[name]}
    </svg>
  );
}
