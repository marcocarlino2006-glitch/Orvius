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
  description: `Sign in to ${company.productName} with Google.`,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string; dev?: string }>;
}) {
  const params = await searchParams;
  const callbackUrl = params.callbackUrl ?? "/dashboard";
  const error = params.error;
  const auth = getAuthConfigStatus();
  const missing = auth.items.filter((item) => !item.optional && !item.configured);
  // Builder chrome stays off the finished login surface unless ?dev=1
  const showDevChrome =
    isDevAuthBypassEnabled() &&
    (params.dev === "1" || params.dev === "true");
  const devEmail = showDevChrome ? getDevAuthEmail() : null;

  return (
    <main className="ov-auth">
      <header className="ov-auth-header">
        <Link href="/" aria-label="Return to Orvius">
          <OrviusLogo size="lg" variant="void" />
        </Link>
        <Link href="/pilot" className="ov-auth-audit">
          Book a call audit
        </Link>
      </header>

      <section className="ov-auth-stage" aria-labelledby="sign-in-heading">
        <div className="ov-auth-card">
          <div className="ov-auth-card-head">
            <span className="ov-auth-signal" aria-hidden>
              <OrviusLogo markOnly size="lg" variant="void" />
            </span>
            <p className="ov-auth-eyebrow">Shop workspace</p>
            <h1 id="sign-in-heading">Welcome back.</h1>
            <p>
              Sign in with the Google account connected to your Orvius shop.
            </p>
          </div>

          {error ? (
            <p className="ov-auth-error" role="alert">
              {error === "Configuration"
                ? "Google sign-in is temporarily unavailable."
                : "Sign in failed. Verify your account is authorized, then try again."}
            </p>
          ) : null}

          <div className="ov-auth-actions">
            <GoogleSignInButton
              callbackUrl={callbackUrl}
              className="ov-google-button"
            />
            <p className="ov-auth-assurance">
              Secure authentication. Orvius never receives your Google password.
            </p>
            {showDevChrome ? (
              <details className="ov-auth-dev" open>
                <summary>Local build access</summary>
                <p>
                  Skips Google while building. Never available in production.
                </p>
                <DevSignInButton
                  callbackUrl={callbackUrl}
                  email={devEmail ?? undefined}
                />
              </details>
            ) : null}
          </div>

          {process.env.NODE_ENV === "development" && !auth.ready ? (
            <details className="ov-auth-setup">
              <summary>Developer OAuth setup</summary>
              <p>
                Connect Google OAuth in Vercel before the sign-in button works.
              </p>
              <ol>
                <li>
                  Open{" "}
                  <a
                    href="https://console.cloud.google.com/apis/credentials"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Google Cloud Console → Credentials
                  </a>
                  , create an OAuth client (Web application).
                </li>
                <li>
                  Add these redirect URIs:
                  <ul>
                    {auth.redirectUris.map((uri) => (
                      <li key={uri}>
                        <code>{uri}</code>
                      </li>
                    ))}
                  </ul>
                </li>
                <li>
                  In Vercel → Project → Settings → Environment Variables, add:
                  <ul>
                    {missing.map((item) => (
                      <li key={item.name}>
                        <code>{item.name}</code>
                      </li>
                    ))}
                  </ul>
                </li>
                <li>Redeploy, then return here and sign in.</li>
              </ol>
            </details>
          ) : null}

          <p className="ov-auth-legal">
            By signing in you agree to the{" "}
            <Link href="/terms">Terms of Service</Link> and{" "}
            <Link href="/privacy">Privacy Policy</Link>.
          </p>
        </div>
      </section>

      <footer className="ov-auth-footer">
        <span>© {new Date().getFullYear()} {company.legalName}</span>
        <nav aria-label="Legal">
          <Link href="/security">Security</Link>
          <Link href="/privacy">Privacy</Link>
          <a href={`mailto:${company.supportEmail}`}>Support</a>
        </nav>
      </footer>
    </main>
  );
}
