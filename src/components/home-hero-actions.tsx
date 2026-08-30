import { auth } from "@/auth";
import Link from "next/link";

export async function HomeHeroActions() {
  const session = await auth();

  return (
    <div className="editorial-actions font-sans">
      <Link href={session?.user ? "/dashboard" : "/login"} className="editorial-cta">
        Open the OS
      </Link>
      <Link href="/demo" className="editorial-link">
        Hear a call
      </Link>
    </div>
  );
}
