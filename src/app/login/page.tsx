import { GoogleSignInButton } from "@/components/google-sign-in-button";
import { ShellHeader } from "@/components/shell-header";
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
    <>
      <ShellHeader plane="chalk" cta={false} nav={false} />

      <main className="editorial bg-chalk text-void">
        <section className="editorial-hero">
          <div className="editorial-wrap max-w-lg">
            <p className="home-os-kicker">Orvius OS</p>
            <h1 className="mt-4 font-serif text-[clamp(2rem,4vw,2.75rem)] leading-[1.08] tracking-[-0.04em]">
              Sign in to Orvius
            </h1>
            <p className="editorial-lead font-sans">
              Use your Google account to open the OS — inbox, customers, jobs,
              and the field board.
            </p>

            {error ? (
              <p className="mt-6 rounded-md border border-flare/25 bg-flare/8 px-4 py-3 font-sans text-sm text-flare-dim">
                Sign in failed. Check that your Google account is allowed, then
                try again.
              </p>
            ) : null}

            <div className="mt-8">
              <GoogleSignInButton callbackUrl={callbackUrl} />
            </div>

            <Link href="/" className="editorial-link editorial-link-inline mt-8 font-sans">
              ← Back to homepage
            </Link>
          </div>
        </section>
      </main>
    </>
  );
}
