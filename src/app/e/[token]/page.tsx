import { PublicEstimateClient } from "@/components/public-estimate-client";

type PageProps = { params: Promise<{ token: string }> };

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
