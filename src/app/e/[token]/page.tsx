import "@/app/public-field.css";
import { PublicEstimateClient } from "@/components/public-estimate-client";

import type { Metadata } from "next";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Estimate", robots: { index: false, follow: false } };

export default async function PublicEstimatePage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="public-shell">
      <div className="public-shell-inner">
        <PublicEstimateClient token={token} />
      </div>
    </main>
  );
}
