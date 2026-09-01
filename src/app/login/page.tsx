import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { OrviusLogo } from "@/components/orvius-logo";
import { getAuthConfigStatus } from "@/lib/auth-env";
import { company } from "@/lib/company";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Sign in",
  description: `Sign in to ${company.productName} with Google.`,
};

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

  return (
    <main className="tier1-login">
      <section className="tier1-login-brand">
        <div className="tier1-login-brand-glow" aria-hidden />
        <div className="tier1-login-brand-inner">
          <OrviusLogo size="lg" variant="void" />
          <p className="tier1-eyebrow tier1-eyebrow-light font-sans">
            {company.productName}
          </p>
          <h1 className="tier1-login-title font-brand">
            Sign in to your workspace.
          </h1>
          <p className="tier1-login-lead font-sans">
            Inbox, customers, jobs, dispatch — one system of record for every
            call, customer, and job.
          </p>
          <ul className="tier1-login-rings font-sans">
            <li>01 · Answer · qualify · alert</li>
            <li>02 · Customer records</li>
            <li>03 · Jobs & scheduling</li>
            <li>04 · Field dispatch</li>
          </ul>
        </div>
      </section>

      <section className="tier1-login-form">
        <div className="tier1-login-form-inner">
          <h2 className="tier1-form-title font-sans">Workspace access</h2>
          <p className="tier1-form-sub font-sans">
            Use the Google account connected to your Orvius shop.
          </p>

          {error ? (
            <p className="tier1-login-error font-sans">
              {error === "Configuration"
                ? "Google sign-in is not configured yet. Add OAuth credentials in Vercel (see steps below)."
                : "Sign in failed. Verify your account is authorized, then try again."}
            </p>
          ) : null}

          {!auth.ready ? (
            <details className="tier1-login-setup font-sans">
              <summary className="tier1-login-setup-title">
                Google OAuth setup (for developers)
              </summary>
              <p className="tier1-login-setup-lead">
                The sign-in button will not work until you connect Google OAuth in
                Vercel. This takes about 5 minutes.
              </p>
              <ol className="tier1-login-setup-steps">
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
                  <ul className="tier1-login-setup-uris">
                    {auth.redirectUris.map((uri) => (
                      <li key={uri}>
                        <code>{uri}</code>
                      </li>
                    ))}
                  </ul>
                </li>
                <li>
                  In Vercel → Project → Settings → Environment Variables, add:
                  <ul className="tier1-login-setup-uris">
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

          <div className="tier1-login-actions">
            <GoogleSignInButton
              callbackUrl={callbackUrl}
              className="google-sign-in-btn google-sign-in-btn-full"
            />
          </div>

          <div className="tier1-login-links font-sans">
            <Link href="/">← orvius.im</Link>
            <Link href="/pilot">Design partner program</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
