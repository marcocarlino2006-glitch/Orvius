import Link from "next/link";
import { BrandIntro } from "@/components/brand-intro";
import { HomeStickyCall } from "@/components/home-sticky-call";
import { OrviusLogo } from "@/components/orvius-logo";
import { ShellHeader } from "@/components/shell-header";
import { SiteFooter } from "@/components/site-footer";

const DEFAULT_CTA = { href: "tel:+18446439170", label: "Call demo" } as const;

type PublicLayoutProps = {
  children: React.ReactNode;
  showFooter?: boolean;
  showStickyCall?: boolean;
  cta?: { href: string; label: string } | false;
};

/** Shared chrome — institutional tier, one visual system. */
export function PublicLayout({
  children,
  showFooter = true,
  showStickyCall = false,
  cta = DEFAULT_CTA,
}: PublicLayoutProps) {
  return (
    <>
      <ShellHeader plane="chalk" surface="glass" position="fixed" cta={cta} />
      {showStickyCall ? <HomeStickyCall /> : null}
      <main className="cursor-page cursor-page-light marketing-page tier1-page">{children}</main>
      {showFooter ? <SiteFooter /> : null}
    </>
  );
}

type MarketingShellProps = PublicLayoutProps & {
  /** Stripe/Linear-style shell for the homepage. */
  premium?: boolean;
};

function PremiumMarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-page">
      <header className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link href="/" className="mkt-nav-brand">
            <OrviusLogo variant="void" size="md" />
          </Link>
          <nav className="mkt-nav-links" aria-label="Main">
            <Link href="/#workflow">How it works</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/pilot">Call audit</Link>
            <Link href="/login">Log in</Link>
          </nav>
          <div className="mkt-nav-actions">
            <Link href="/signup" className="mkt-btn mkt-btn-ghost mkt-btn-sm">
              Sign up
            </Link>
            <Link href="/pilot" className="mkt-btn mkt-btn-primary mkt-btn-sm">
              Book audit
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mkt-footer">
        <div className="mkt-footer-inner">
          <OrviusLogo variant="chalk" size="sm" />
          <p className="mkt-footer-tag">Turn missed calls into booked jobs.</p>
          <nav className="mkt-footer-links" aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/pilot">Call audit</Link>
            <Link href="/login">Log in</Link>
            <Link href="/signup">Sign up</Link>
          </nav>
          <p className="mkt-footer-copy">© {new Date().getFullYear()} Orvius</p>
        </div>
      </footer>
    </div>
  );
}

export function MarketingShell({ premium, children, ...rest }: MarketingShellProps) {
  if (premium) {
    return <PremiumMarketingShell>{children}</PremiumMarketingShell>;
  }
  return <PublicLayout {...rest}>{children}</PublicLayout>;
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
