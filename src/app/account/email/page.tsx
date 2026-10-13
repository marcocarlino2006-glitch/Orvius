import type { Metadata } from "next";
import Link from "next/link";

import { EmailChangeConfirm } from "@/components/email-change-confirm";
import { peekEmailChange } from "@/lib/email-change";

export const metadata: Metadata = {
  title: "Confirm your new sign-in email",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function EmailChangePage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const token = (await searchParams).token ?? "";
  const pending = await peekEmailChange(token);
  return (
    <main className="ov-signin ov-signin--verify">
      {pending ? (
        <EmailChangeConfirm token={token} fromEmail={pending.fromEmail} toEmail={pending.toEmail} />
      ) : (
        <div className="ov-signin-verify">
          <h1>That link is no longer valid.</h1>
          <p>Email change links work once and expire after an hour. Sign in with your current address and start the change again from Settings.</p>
          <Link className="ov-signin-submit" href="/signin">
            Back to sign in
          </Link>
        </div>
      )}
    </main>
  );
}
