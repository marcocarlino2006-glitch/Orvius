import Link from "next/link";
import { BrandIntro } from "@/components/brand-intro";
import { HomeStickyCall } from "@/components/home-sticky-call";
import { OrviusLogo } from "@/components/orvius-logo";
import { I18nRuntime } from "@/components/i18n-runtime";
import { PremiumNav } from "@/components/premium-nav";
import { ShellHeader } from "@/components/shell-header";
import { SiteControls } from "@/components/site-controls";
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
      <ShellHeader
        plane="void"
        surface="glass"
        position="fixed"
        cta={cta}
        nav={[
          { href: "/pricing", label: "Pricing" },
          { href: "/pilot", label: "Audit" },
          { href: "/security", label: "Security" },
        ]}
      />
      {showStickyCall ? <HomeStickyCall /> : null}
      <main className="cursor-page marketing-page mkt-page mkt-page--craft">{children}</main>
      {showFooter ? <SiteFooter /> : null}
    </>
  );
}

type MarketingShellProps = PublicLayoutProps & {
  /** Claude/Anthropic-style shell for the homepage. */
  premium?: boolean;
};

function PremiumMarketingShell({ children }: { children: React.ReactNode }) {
  const year = new Date().getFullYear();
  return (
    <div className="mkt-page mkt-page--craft">
      <PremiumNav />
      <main>{children}</main>
      <footer className="mkt-footer mkt-footer--institution mkt-footer--cursor">
        <div className="mkt-footer-grid mkt-footer-grid--cursor">
          <div className="mkt-footer-brand">
            <OrviusLogo variant="void" size="sm" />
            <p className="mkt-footer-entity font-sans">Solution Development LLC</p>
            <p className="mkt-footer-tagline font-sans" data-i18n="footer.tagline">
              The night-shift OS for HVAC, plumbing, and electrical.
            </p>
          </div>
          <nav className="mkt-footer-col" aria-label="Product">
            <p className="mkt-footer-heading font-sans">Product</p>
            <Link href="/">Home</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/pilot">Call audit</Link>
            <Link href="/login">Log in</Link>
          </nav>
          <nav className="mkt-footer-col" aria-label="Company">
            <p className="mkt-footer-heading font-sans">Company</p>
            <Link href="/about">About</Link>
            <Link href="/security">Security</Link>
            <Link href="/pilot">Design partners</Link>
            <a href="mailto:hello@orvius.im">Contact</a>
          </nav>
          <nav className="mkt-footer-col" aria-label="Legal">
            <p className="mkt-footer-heading font-sans">Legal</p>
            <Link href="/legal">Legal hub</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/sms-terms">SMS terms</Link>
            <Link href="/refunds">Refunds</Link>
          </nav>
          <nav className="mkt-footer-col" aria-label="Connect">
            <p className="mkt-footer-heading font-sans">Connect</p>
            <a href="tel:+18446439170">+1 844 643 9170</a>
            <a href="mailto:hello@orvius.im">hello@orvius.im</a>
            <Link href="/domains">Domains</Link>
          </nav>
        </div>
        <div className="mkt-footer-bottom mkt-footer-bottom--cursor">
          <p className="mkt-footer-copy">
            © {year} Solution Development LLC. All rights reserved.
          </p>
          <p className="mkt-footer-mark">
            Orvius™ is a trademark of Solution Development LLC.
          </p>
          <SiteControls />
        </div>
      </footer>
      <I18nRuntime />
    </div>
  );
}

export function MarketingShell({
  premium = true,
  children,
  ...rest
}: MarketingShellProps) {
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
