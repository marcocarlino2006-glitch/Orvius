"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OsShell } from "@/components/os-shell";
import { ShellLoading } from "@/components/shell-primitives";
import { settingsSectionForHref } from "@/lib/settings-center";

/** Settings live in the panel over Command; this route keeps old links and bookmarks working. */
export default function DashboardSettingsPage() {
  const router = useRouter();

  useEffect(() => {
    const section = settingsSectionForHref(`${window.location.pathname}${window.location.search}${window.location.hash}`);
    router.replace(`/dashboard?settings=${section ?? "business"}`);
  }, [router]);

  return (
    <OsShell title="Settings">
      <ShellLoading label="Opening settings…" />
    </OsShell>
  );
}
