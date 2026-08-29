"use client";

import { OsShell } from "@/components/os-shell";

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  businessName?: string;
  statusLabel?: string;
  actions?: React.ReactNode;
};

/** @deprecated Prefer OsShell directly — kept for pages not yet migrated. */
export function AppShell(props: AppShellProps) {
  return <OsShell {...props} />;
}
