import { auth } from "@/auth";
import Link from "next/link";

export async function HomeHeroActions() {
  const session = await auth();

  if (session?.user) {
    return (
      <div className="editorial-actions font-sans">
        <Link href="/dashboard" className="editorial-cta">
          Open the OS
        </Link>
        <Link href="/demo" className="editorial-link">
          Hear a call
        </Link>
      </div>
    );
  }

  return (
    <div className="editorial-actions font-sans">
      <Link href="/login" className="editorial-cta">
        Sign in
      </Link>
      <Link href="/demo" className="editorial-link">
        Hear a call
      </Link>
    </div>
  );
}
