import Link from "next/link";
import { BrandIntro } from "@/components/brand-intro";
import { OrviusLogo } from "@/components/orvius-logo";
import { I18nRuntime } from "@/components/i18n-runtime";
import { PremiumNav } from "@/components/premium-nav";
import { UtilityDock } from "@/components/utility-dock";
import { DEMO_LINE_DISPLAY, demoLineHref } from "@/lib/demo-line";
import { supportEmail, supportMailto, supportPhone } from "@/lib/support";

const phone = supportPhone();

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
        <a href="#main" className="ov-skip-link">
          Skip to content
        </a>
        <PremiumNav />
        <main id="main" tabIndex={-1}>
          {children}
        </main>
        <footer className="mkt-footer mkt-footer--institution">
          <div className="mkt-footer-grid">
            <div className="mkt-footer-brand">
              <OrviusLogo variant="void" size="sm" />
              <p className="mkt-footer-tagline font-sans" data-i18n="footer.tagline">
                The operating system for businesses that run on the phone.
              </p>
            </div>
            <nav className="mkt-footer-col" aria-label="Product">
              <p className="mkt-footer-heading font-sans">Product</p>
              <Link href="/product">Product</Link>
              <Link href="/pricing">Pricing</Link>
              <Link href="/enterprise">Enterprise</Link>
              <Link href="/pilot">Call audit</Link>
              <Link href="/resources">Resources</Link>
              <Link href="/help">Help center</Link>
              <Link href="/changelog">Changelog</Link>
              <Link href="/signin">Sign in</Link>
            </nav>
            <nav className="mkt-footer-col" aria-label="Company">
              <p className="mkt-footer-heading font-sans">Company</p>
              <Link href="/about">About</Link>
              <Link href="/security">Security</Link>
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
              <a href={supportMailto({ subject: "Support" })}>Support · {supportEmail}</a>
              {phone ? <a href={`tel:${phone.tel}`}>Call support · {phone.display}</a> : null}
              <a href={demoLineHref()}>Hear the AI · {DEMO_LINE_DISPLAY}</a>
              <Link href="/status">Status</Link>
            </nav>
          </div>
          <div className="mkt-footer-bottom mkt-footer-bottom--legal">
            <p className="mkt-footer-copy">
              © {year} Solution Development LLC. All rights reserved.
            </p>
            <p className="mkt-footer-mark">
              Orvius™ is a trademark of Solution Development LLC.
            </p>
            <UtilityDock placement="inline" />
          </div>
        </footer>
        <I18nRuntime />
      </div>
    </>
  );
}

export function ShellPageIntro({
  label,
  title,
  subline,
  description,
  className = "",
  actions,
}: {
  label: string;
  title: string;
  subline?: string;
  description?: string;
  className?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className={`shell-page-intro ${className}`.trim()}>
      <BrandIntro
        kicker={label}
        title={title}
        subline={subline}
        description={description}
        align="left"
        brand={false}
      />
      {actions ? <div className="tier1-actions shell-page-actions">{actions}</div> : null}
    </div>
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
