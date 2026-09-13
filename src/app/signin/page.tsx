import type { Metadata } from "next";
import Link from "next/link";
import { DevSignInButton } from "@/components/dev-sign-in-button";
import { OrviusLogo } from "@/components/orvius-logo";
import { SignInBoard } from "@/components/signin-board";
import { SignInPanel } from "@/components/signin-panel";
import { SystemStatusPill } from "@/components/system-status-pill";
import { company } from "@/lib/company";
import { getDevAuthEmail, isDevAuthBypassEnabled } from "@/lib/dev-auth";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${company.productName} with Google or a single-use email link.`,
  robots: { index: false, follow: true },
};

const ERRORS: Record<string, string> = {
  Configuration: "Sign-in is temporarily unavailable. Try again shortly.",
  AccessDenied: "That account is not authorized for this workspace.",
  CredentialsSignin:
    "That sign-in link is no longer valid. Links work once and expire after 10 minutes.",
  Verification: "That sign-in link has expired. Request a new one below.",
};

/**
 * Split canvas: the board on the left shows what the product does all night,
 * the card on the right is the only thing asking for input. One column on
 * narrow screens, where the card leads and the board is dropped rather than
 * squeezed.
 */
export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; dev?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const error = params.error ? (ERRORS[params.error] ?? ERRORS.CredentialsSignin) : null;
  const showDevChrome =
    isDevAuthBypassEnabled() && (params.dev === "1" || params.dev === "true");

  return (
    <main className="ov-signin">
      <section className="ov-signin-canvas">
        <div className="ov-signin-canvas-inner">
          <div className="mkt-nav-brandline">
            <Link href="/" className="ov-signin-brand" aria-label="Return to Orvius">
              <OrviusLogo variant="void" size="lg" />
            </Link>
            <SystemStatusPill />
          </div>

          <h2 className="ov-signin-pitch">
            The night shift already ran. Here is what it did.
          </h2>
          <p className="ov-signin-pitch-sub">
            Orvius answers after-hours and overflow calls, captures the request,
            proposes an open window, and alerts the owner — then writes one
            record the shop can act on in the morning.
          </p>

          <SignInBoard />
        </div>
      </section>

      <section className="ov-signin-panel" aria-labelledby="signin-heading">
        <div className="ov-signin-panel-inner">
          <Link href="/" className="ov-signin-brand ov-signin-brand--mobile">
            <OrviusLogo variant="void" size="lg" />
          </Link>

          <h2 id="signin-heading" className="sr-only">
            Sign in
          </h2>

          {error ? (
            <p className="ov-signin-alert" role="alert">
              {error}
            </p>
          ) : null}

          <SignInPanel callbackUrl={callbackUrl} />

          {showDevChrome ? (
            <details className="ov-signin-dev" open>
              <summary>Local build access</summary>
              <p>Skips Google while building. Never available in production.</p>
              <DevSignInButton
                callbackUrl={callbackUrl}
                email={getDevAuthEmail() ?? undefined}
              />
            </details>
          ) : null}

          <footer className="ov-signin-foot">
            <span>
              © {new Date().getFullYear()} {company.legalName}
            </span>
            <nav aria-label="Legal">
              <Link href="/security">Security</Link>
              <Link href="/privacy">Privacy</Link>
              <a href={`mailto:${company.supportEmail}`}>Support</a>
            </nav>
          </footer>
        </div>
      </section>
    </main>
  );
}
