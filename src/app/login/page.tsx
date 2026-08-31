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
    <main className="login-pro">
      <section className="login-pro-brand">
        <div className="login-pro-brand-inner">
          <OrviusLogo size="lg" variant="void" showOs />
          <p className="login-pro-kicker font-sans">Orvius OS</p>
          <h1 className="login-pro-title font-serif">
            The operating system for your shop.
          </h1>
          <p className="login-pro-lead font-sans">
            Inbox, customers, jobs, dispatch — one intelligence layer for every
            call, every customer, every job.
          </p>
          <ul className="login-pro-rings font-sans">
            <li>01 · Answer · qualify · alert</li>
            <li>02 · Customer records</li>
            <li>03 · Jobs & scheduling</li>
            <li>04 · Field dispatch</li>
          </ul>
        </div>
      </section>

      <section className="login-pro-form">
        <div className="login-pro-form-inner">
          <h2 className="login-pro-form-title font-serif">Sign in to your shop</h2>
          <p className="login-pro-form-sub font-sans">
            Use the Google account connected to your Orvius workspace.
          </p>

          {error ? (
            <p className="login-pro-error font-sans">
              Sign in failed. Check that your Google account is allowed, then try
              again.
            </p>
          ) : null}

          <div className="login-pro-actions">
            <GoogleSignInButton callbackUrl={callbackUrl} />
          </div>

          <div className="login-pro-links font-sans">
            <Link href="/">← Homepage</Link>
            <Link href="/pilot">Apply for design partner</Link>
          </div>
        </div>
      </section>
    </main>
  );
}
