import type { Metadata } from "next";
import Link from "next/link";

import { lifecycleEmailsStopped, verifyLifecycleEmailToken } from "@/lib/lifecycle-email";
import { prisma } from "@/lib/prisma";

export const metadata: Metadata = {
  title: "Setup emails",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/* Opening the link changes nothing (mail scanners open every link); only the button stops the emails. */
export default async function SetupEmailsPage({ searchParams }: { searchParams: Promise<{ t?: string }> }) {
  const token = (await searchParams).t ?? "";
  const businessId = verifyLifecycleEmailToken(token);
  const shop = businessId ? await prisma.business.findUnique({ where: { id: businessId }, select: { name: true } }) : null;
  const stopped = shop && businessId ? await lifecycleEmailsStopped(businessId).catch(() => false) : false;
  return (
    <main className="ov-signin ov-signin--verify">
      <div className="ov-signin-verify">
        {!shop ? (
          <>
            <h1>That link isn&apos;t valid.</h1>
            <p>Open the link at the bottom of the email again.</p>
            <Link className="ov-signin-submit" href="/signin">
              Sign in
            </Link>
          </>
        ) : stopped ? (
          <>
            <h1>Stopped.</h1>
            <p>Orvius won&apos;t send setup, welcome or first-call emails for {shop.name} again. Alerts about your calls and your account still come.</p>
            <Link className="ov-signin-submit" href="/dashboard">
              Open Orvius
            </Link>
          </>
        ) : (
          <>
            <h1>Stop these emails?</h1>
            <p>Orvius will stop setup, welcome and first-call emails for {shop.name}. Alerts about your calls and your account still come.</p>
            <form method="post" action={`/api/public/setup-emails?t=${encodeURIComponent(token)}`}>
              <input type="hidden" name="from" value="page" />
              <button className="ov-signin-submit" type="submit">
                Stop these emails
              </button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
