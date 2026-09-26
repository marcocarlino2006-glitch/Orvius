import type { Metadata } from "next";
import { PublicInvoiceClient } from "@/components/public-invoice-client";

type PageProps = { params: Promise<{ token: string }> };

export const metadata: Metadata = { title: "Invoice", robots: { index: false, follow: false } };

export default async function PublicInvoicePage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="public-shell">
      <div className="public-shell-inner">
        <PublicInvoiceClient token={token} />
      </div>
    </main>
  );
}
