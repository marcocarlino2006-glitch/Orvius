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
    <div className="min-h-screen bg-paper pb-28">
      <header className="border-b border-line bg-paper/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4 md:px-8">
          <Link
            href="/"
            className="font-sans text-[1.05rem] font-medium tracking-tight text-ink"
          >
            Orvius
          </Link>
          <p className="hidden font-sans text-sm text-muted md:block">
            AI operating partner
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-6 pt-10 md:px-8">
        <div className="mb-10 max-w-2xl">
          <h1 className="font-serif text-4xl leading-tight tracking-[-0.03em] text-ink md:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-4 font-serif text-lg leading-relaxed text-muted">
              {subtitle}
            </p>
          ) : null}
        </div>
        {children}
      </div>

      <ProfileMenu businessName={businessName} statusLabel={statusLabel} />
    </div>
  );
}
