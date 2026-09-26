import type { SettingsSectionId } from "@/lib/settings-center";

const PATHS: Record<SettingsSectionId | "help" | "close" | "back" | "external" | "search", string[]> = {
  account: ["M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z", "M4.5 20a7.5 7.5 0 0 1 15 0"],
  business: ["M4 20V8l8-4 8 4v12", "M9 20v-6h6v6", "M3 20h18"],
  phone: [
    "M6.6 3.5h2.6l1.3 4-2 1.3a11 11 0 0 0 6.7 6.7l1.3-2 4 1.3v2.6A2.1 2.1 0 0 1 18.4 20 14.9 14.9 0 0 1 4 5.6a2.1 2.1 0 0 1 2.6-2.1Z",
  ],
  hours: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M12 7v5l3 2"],
  receptionist: ["M12 3.5 13.9 9l5.6.4-4.3 3.6 1.4 5.5L12 15.5l-4.6 3 1.4-5.5-4.3-3.6 5.6-.4L12 3.5Z"],
  notifications: ["M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15L6 16Z", "M10 20.5a2 2 0 0 0 4 0"],
  team: [
    "M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z",
    "M2.5 20a6.5 6.5 0 0 1 13 0",
    "M16 4.5a3.5 3.5 0 0 1 0 6.5",
    "M18 14a6.5 6.5 0 0 1 3.5 6",
  ],
  integrations: ["M9 3v5", "M15 3v5", "M6 8h12v3a6 6 0 0 1-12 0V8Z", "M12 17v4"],
  billing: ["M3 6.5h18v11H3z", "M3 10h18", "M7 14.5h3"],
  performance: ["M4 20V10", "M10 20V4", "M16 20v-7", "M22 20H2"],
  data: [
    "M12 3c4.4 0 8 1.3 8 3s-3.6 3-8 3-8-1.3-8-3 3.6-3 8-3Z",
    "M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6",
    "M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6",
  ],
  internal: ["M12 3 4 6v5c0 5 3.4 8.6 8 10 4.6-1.4 8-5 8-10V6l-8-3Z"],
  help: ["M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z", "M9.5 9.5a2.5 2.5 0 1 1 3.3 2.4c-.5.2-.8.7-.8 1.2v.4", "M12 16.8v.2"],
  close: ["M6 6l12 12", "M18 6 6 18"],
  back: ["M15 5l-7 7 7 7"],
  external: ["M14 4h6v6", "M20 4l-9 9", "M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"],
  search: ["M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Z", "M20 20l-4-4"],
};

export function SettingsIcon({ name }: { name: keyof typeof PATHS }) {
  return (
    <svg className="sc-icon" viewBox="0 0 24 24" fill="none" aria-hidden>
      {PATHS[name].map((d) => (
        <path key={d} d={d} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      ))}
    </svg>
  );
}
