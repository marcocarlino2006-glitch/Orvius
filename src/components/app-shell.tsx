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
    <div className="product-workspace min-h-screen">
      <div
        className="h-[2px] bg-gradient-to-r from-flare via-flare/60 to-transparent"
        aria-hidden
      />

      <ShellHeader
        plane="chalk"
        position="sticky"
        surface="solid"
        cta={{ href: "/pilot", label: "Start free pilot" }}
        nav={[
          { href: "/", label: "Home" },
          { href: "/pricing", label: "Pricing" },
          { href: "/demo", label: "Demo" },
          { href: "/pilot", label: "Pilot" },
        ]}
      />

      <div className="mx-auto max-w-5xl px-6 pt-10 md:px-8 md:pt-12">
        <header className="app-shell-intro mb-10 max-w-2xl">
          <p className="eyebrow anim-rise">Orvius product</p>
          <h1 className="anim-rise anim-rise-delay-1 mt-3 font-serif text-4xl leading-[1.04] tracking-[-0.045em] text-void md:text-[2.75rem]">
            {title}
          </h1>
          {subtitle ? (
            <p className="anim-rise anim-rise-delay-2 mt-4 max-w-lg font-sans text-[0.9375rem] leading-relaxed text-ash md:text-base">
              {subtitle}
            </p>
          ) : null}
        </header>

        <div className="app-shell-content">{children}</div>
      </div>

      <ProfileMenu businessName={businessName} statusLabel={statusLabel} />
    </div>
  );
}
