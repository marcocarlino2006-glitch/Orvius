import { redirect } from "next/navigation";
import { settingsRedirectTarget } from "@/lib/settings-center";

export default function DashboardProfilePage() {
  redirect(settingsRedirectTarget("/dashboard/profile", null));
}
