"use client";

import { ProfileMenu } from "@/components/profile-menu";
import { ShellHeader } from "@/components/shell-header";

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
  statusLabel = "Founder workspace",
}: AppShellProps) {
  return (
    <div className="min-h-screen bg-chalk pb-28">
      <div className="h-px bg-flare/80" aria-hidden />

      <ShellHeader
        plane="chalk"
        position="sticky"
        cta={{ href: "/pilot", label: "Start free pilot" }}
        secondaryHref={{ href: "/", label: "Home" }}
      />

      <div className="mx-auto max-w-5xl px-6 pt-12 md:px-8 md:pt-14">
        <header className="mb-10 max-w-2xl border-b border-rule pb-8">
          <p className="font-sans text-xs font-semibold tracking-[0.2em] text-flare uppercase">
            Orvius product
          </p>
          <h1 className="mt-3 font-serif text-4xl leading-[1.06] tracking-[-0.04em] text-void md:text-5xl">
            {title}
          </h1>
          {subtitle ? (
            <p className="mt-4 font-sans text-base leading-relaxed text-ash md:text-lg">
              {subtitle}
            </p>
          ) : null}
        </header>

        {children}
      </div>

      <ProfileMenu businessName={businessName} statusLabel={statusLabel} />
    </div>
  );
}
