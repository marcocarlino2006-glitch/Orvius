import Link from "next/link";
import { BrandIntro } from "@/components/brand-intro";
import { OrviusLogo } from "@/components/orvius-logo";
import { I18nRuntime } from "@/components/i18n-runtime";
import { PremiumNav } from "@/components/premium-nav";
import { UtilityDock } from "@/components/utility-dock";

type MarketingShellProps = {
  children: React.ReactNode;
  /** @deprecated Always premium — kept so call sites do not break. */
  premium?: boolean;
  showFooter?: boolean;
  showStickyCall?: boolean;
  cta?: { href: string; label: string } | false;
};

/**
 * One public shell. Nav CTA and footer live here — page-level cta props
 * are ignored so every marketing surface shares the same chrome.
 */
export function MarketingShell({ children }: MarketingShellProps) {
  const year = new Date().getFullYear();
  return (
    <>
      <div className="ov-public mkt-page mkt-page--craft">
        <PremiumNav />
        <main>{children}</main>
        <footer className="mkt-footer mkt-footer--institution">
          <div className="mkt-footer-grid">
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
              <Link href="/signin">Log in</Link>
            </nav>
            <nav className="mkt-footer-col" aria-label="Company">
              <p className="mkt-footer-heading font-sans">Company</p>
              <Link href="/about">About</Link>
              <Link href="/security">Security</Link>
              <Link href="/pilot">Call audit</Link>
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
          <div className="mkt-footer-bottom mkt-footer-bottom--legal">
            <p className="mkt-footer-copy">
              © {year} Solution Development LLC. All rights reserved.
            </p>
            <p className="mkt-footer-mark">
              Orvius™ is a trademark of Solution Development LLC.
            </p>
          </div>
        </footer>
        <I18nRuntime />
      </div>
      <UtilityDock />
    </>
  );
}

export function ShellPageIntro({
  label: _label,
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
      brand
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
