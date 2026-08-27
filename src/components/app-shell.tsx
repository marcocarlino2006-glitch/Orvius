"use client";

import Link from "next/link";
import { ProfileMenu } from "@/components/profile-menu";

type AppShellProps = {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  businessName?: string;
  statusLabel?: string;
};

export function AppShell({
  children,
  title,
  subtitle,
  businessName,
  statusLabel,
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="border-b border-line/80 bg-paper/70 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <Link
            href="/"
            className="font-sans text-xl font-semibold tracking-tight text-ink"
            style={{ fontWeight: 700 }}
          >
            Orvius
          </Link>
          <p className="hidden text-sm text-muted md:block">
            AI operating partner
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-6xl px-6 pt-10">
        <div className="mb-8 max-w-2xl">
          <h1 className="font-sans text-3xl font-semibold tracking-tight text-ink md:text-4xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-3 text-base leading-relaxed text-muted">{subtitle}</p>
          )}
        </div>
        {children}
      </div>

      <ProfileMenu businessName={businessName} statusLabel={statusLabel} />
    </div>
  );
}
