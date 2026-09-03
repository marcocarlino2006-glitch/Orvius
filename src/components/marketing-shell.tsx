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
  /** Claude/Anthropic-style shell for the homepage. */
  premium?: boolean;
};

function PremiumMarketingShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="mkt-page">
      <header className="mkt-nav">
        <div className="mkt-nav-inner">
          <Link href="/" className="mkt-nav-brand">
            <OrviusLogo variant="chalk" size="lg" wordmarkOnly={false} />
          </Link>

          <nav className="mkt-nav-links" aria-label="Main">
            <Link href="/#workflow">Product</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/pilot">Call audit</Link>
            <Link href="/security">Security</Link>
          </nav>

          <div className="mkt-nav-actions">
            <Link href="/login" className="mkt-nav-login">
              Log in
            </Link>
            <Link href="/pilot" className="mkt-btn mkt-btn-ink mkt-btn-sm mkt-btn-pill">
              Try Orvius
            </Link>
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="mkt-footer">
        <div className="mkt-footer-inner">
          <OrviusLogo variant="void" size="sm" />
          <nav className="mkt-footer-links" aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/pilot">Call audit</Link>
            <Link href="/security">Security</Link>
            <Link href="/login">Log in</Link>
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
