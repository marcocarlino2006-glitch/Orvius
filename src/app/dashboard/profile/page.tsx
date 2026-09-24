"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { OsShell } from "@/components/os-shell";
import { ShellLoading } from "@/components/shell-primitives";

export default function DashboardProfilePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace("/dashboard?settings=account");
  }, [router]);

  return (
    <OsShell title="Account">
      <ShellLoading label="Opening account…" />
    </OsShell>
  );
}
