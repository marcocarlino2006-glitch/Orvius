import { TechFieldClient } from "@/components/tech-field-client";

type PageProps = { params: Promise<{ token: string }> };

export default async function TechFieldPage({ params }: PageProps) {
  const { token } = await params;

  return (
    <main className="public-shell">
      <div className="public-shell-inner">
        <TechFieldClient token={token} />
      </div>
    </main>
  );
}
