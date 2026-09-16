import type { Metadata } from "next";
import { SignInVerify } from "@/components/signin-verify";

export const metadata: Metadata = {
  title: "Signing in",
  robots: { index: false, follow: false },
};

/**
 * Landing point for an emailed link. The token is exchanged for a session by
 * the client component, because next-auth's credentials sign-in has to run
 * through the browser to receive the session cookie and follow the redirect.
 */
export default async function VerifyPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string; callbackUrl?: string }>;
}) {
  const params = await searchParams;
  return (
    <main className="ov-signin ov-signin--verify">
      <SignInVerify
        token={params.token ?? ""}
        callbackUrl={params.callbackUrl ?? "/dashboard"}
      />
    </main>
  );
}
