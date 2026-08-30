import { BrandIntro } from "@/components/brand-intro";
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
      <ShellHeader plane="chalk" cta={{ href: "/pilot", label: "Free pilot" }} nav={false} />

      <main className="editorial bg-chalk text-void">
        <section className="editorial-hero">
          <div className="editorial-wrap max-w-lg">
            <BrandIntro
              kicker="Orvius OS"
              title="Sign in to your shop."
              subline="Inbox, customers, jobs, and the field board — one operating system."
              align="left"
              titleClassName="!text-[clamp(2rem,4vw,2.75rem)] !max-w-none"
            />

            {error ? (
              <p className="mt-6 rounded-md border border-flare/25 bg-flare/8 px-4 py-3 font-sans text-sm text-flare-dim">
                Sign in failed. Check that your Google account is allowed, then
                try again.
              </p>
            ) : null}

            <div className="mt-8">
              <GoogleSignInButton callbackUrl={callbackUrl} />
            </div>

            <div className="editorial-actions mt-8 font-sans">
              <Link href="/" className="editorial-link">
                ← Back to homepage
              </Link>
              <Link href="/pilot" className="editorial-link">
                Apply for free pilot
              </Link>
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
