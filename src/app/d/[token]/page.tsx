import { PublicDepositClient } from "@/components/public-deposit-client";

type PageProps = { params: Promise<{ token: string }> };

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
