import { BrandIntro } from "@/components/brand-intro";
import { HomeStickyCall } from "@/components/home-sticky-call";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";

const DEFAULT_CTA = { href: "tel:+18446439170", label: "Call demo" } as const;

type PublicLayoutProps = {
  children: React.ReactNode;
  showFooter?: boolean;
  showStickyCall?: boolean;
  cta?: { href: string; label: string } | false;
};

/** Shared chrome for homepage and all marketing pages — one light system. */
export function PublicLayout({
  children,
  showFooter = true,
  showStickyCall = false,
  cta = DEFAULT_CTA,
}: PublicLayoutProps) {
  return (
    <>
      <ShellHeader
        plane="chalk"
        surface="glass"
        position="fixed"
        cta={cta}
      />
      {showStickyCall ? <HomeStickyCall /> : null}
      <main className="cursor-page cursor-page-light marketing-page">{children}</main>
      {showFooter ? <SiteFooter /> : null}
    </>
  );
}

type MarketingShellProps = PublicLayoutProps;

export function MarketingShell(props: MarketingShellProps) {
  return <PublicLayout {...props} />;
}

export function ShellPageIntro({
  label,
  title,
  subline,
  description,
  className = "",
}: {
  label: string;
  title: string;
  subline?: string;
  description?: string;
  className?: string;
}) {
  return (
    <BrandIntro
      className={className}
      kicker={label}
      title={title}
      subline={subline}
      description={description}
      align="left"
    />
  );
}

export function ShellChalkPanel({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={`panel-chalk ${className}`}>{children}</div>;
}

/** @deprecated Use ShellChalkPanel — kept for gradual migration */
export const ShellVoidPanel = ShellChalkPanel;
