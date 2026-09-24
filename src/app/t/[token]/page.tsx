import { TechFieldClient } from "@/components/tech-field-client";

type PageProps = { params: Promise<{ token: string }> };

export default async function TechFieldPage({ params }: PageProps) {
  const { token } = await params;
  return <TechFieldClient token={token} />;
}
