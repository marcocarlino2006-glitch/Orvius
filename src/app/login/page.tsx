import { DevSignInButton } from "@/components/dev-sign-in-button";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { OrviusLogo } from "@/components/orvius-logo";
import { getAuthConfigStatus } from "@/lib/auth-env";
import { company } from "@/lib/company";
import { getDevAuthEmail, isDevAuthBypassEnabled } from "@/lib/dev-auth";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${company.productName}.`,
};

/**
 * Cursor / Linear energy: one brand, one line, one button.
 * No marketing essay. No double wordmark. No setup chrome in production.
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const error = params.error;
  const auth = getAuthConfigStatus();
  const missing = auth.items.filter((item) => !item.optional && !item.configured);
  const showSetup =
    process.env.NODE_ENV === "development" && !auth.ready && missing.length > 0;
  const devBypass = isDevAuthBypassEnabled();
  const devEmail = devBypass ? getDevAuthEmail() : null;

  return (
    <main className="auth-shell">
      <section className="auth-stage">
        <Link href="/" className="auth-stage-brand">
          <OrviusLogo size="lg" variant="void" />
        </Link>
        <h1 className="auth-stage-title">The shop OS for trades.</h1>
        <p className="auth-stage-copy">
          Calls, jobs, and dispatch — one system of record.
        </p>
      </section>

      <section className="auth-panel">
        <div className="auth-panel-inner">
          <Link href="/" className="auth-panel-brand">
            <OrviusLogo size="md" variant="chalk" />
          </Link>

          <h2 className="auth-panel-title">Sign in</h2>
          <p className="auth-panel-sub">Continue with your Google account.</p>

          {error ? (
            <p className="auth-error" role="alert">
              {error === "Configuration"
                ? "Google sign-in isn’t configured yet."
                : "Sign in failed. Try again."}
            </p>
          ) : null}

          <div className="auth-actions">
            <GoogleSignInButton
              callbackUrl={callbackUrl}
              className="auth-google"
              label="Continue with Google"
            />
          </div>

          {showSetup ? (
            <details className="auth-setup">
              <summary>Dev: Google OAuth</summary>
              <ol>
                <li>
                  Create an OAuth client in{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Cloud Console
                  </a>
                  .
                </li>
                <li>
                  Redirect URIs:
                  <ul>
                    {auth.redirectUris.map((uri) => (
                      <li key={uri}>
                        <code>{uri}</code>
                      </li>
                    ))}
                  </ul>
                </li>
                <li>
                  Set in Vercel:{" "}
                  {missing.map((item) => item.name).join(", ")}
                </li>
              </ol>
            </details>
          ) : null}

          {devBypass ? (
            <div className="auth-dev">
              <DevSignInButton
                callbackUrl={callbackUrl}
                email={devEmail ?? undefined}
              />
            </div>
          ) : null}

          <p className="auth-legal">
            By continuing, you agree to the{" "}
            <Link href="/terms">Terms</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </section>
    </main>
  );
}
