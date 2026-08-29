import { auth } from "@/auth";
import { GoogleSignInButton } from "@/components/google-sign-in-button";
import Link from "next/link";

export async function HomeHeroActions() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="editorial-actions font-sans">
        <Link href="/dashboard" className="editorial-cta">
          Go to dashboard
        </Link>
        <Link href="/demo" className="editorial-link">
          Hear a demo call
        </Link>
      </div>
    );
  }

  return (
    <div className="editorial-actions font-sans">
      <GoogleSignInButton callbackUrl="/dashboard" />
      <Link href="/demo" className="editorial-link">
        Hear a demo call
      </Link>
    </div>
  );
}
