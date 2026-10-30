import { redirect } from "next/navigation";
import { SETTINGS_PARAM, settingsRedirectTarget } from "@/lib/settings-center";

type Search = Promise<Record<string, string | string[] | undefined>>;

/** Settings live in the panel over Command; this route keeps old links and bookmarks working. */
export default async function DashboardSettingsPage({ searchParams }: { searchParams: Search }) {
  const value = (await searchParams)[SETTINGS_PARAM];
  redirect(settingsRedirectTarget("/dashboard/settings", Array.isArray(value) ? value[0] : value));
}
