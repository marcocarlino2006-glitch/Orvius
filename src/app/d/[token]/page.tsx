import "@/app/public-field.css";
import { PublicDepositClient } from "@/components/public-deposit-client";

import type { Metadata } from "next";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Deposit", robots: { index: false, follow: false } };

export default async function PublicDepositPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="public-shell">
      <div className="public-shell-inner">
        <PublicDepositClient token={token} />
      </div>
    </main>
  );
}
