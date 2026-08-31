import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { OrviusLogo } from "@/components/orvius-logo";
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

  return (
    <main className="tier1-login">
      <section className="tier1-login-brand">
        <div className="tier1-login-brand-glow" aria-hidden />
        <div className="tier1-login-brand-inner">
          <OrviusLogo size="lg" variant="void" showOs={false} />
          <p className="tier1-eyebrow tier1-eyebrow-light font-sans">
            {company.productName}
          </p>
          <h1 className="tier1-login-title font-sans">
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
              Sign in failed. Verify your account is authorized, then try again.
            </p>
          ) : null}

          <div className="tier1-login-actions">
            <GoogleSignInButton callbackUrl={callbackUrl} />
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
