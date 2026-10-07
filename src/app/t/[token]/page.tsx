import { redirect } from "next/navigation";
import { TechFieldClient } from "@/components/tech-field-client";
import { ensureTechAppToken } from "@/lib/tech-app-link";
import { prisma } from "@/lib/prisma";

type PageProps = { params: Promise<{ token: string }> };

/**
 * Old per-job links still work. If the technician has a day app, this
 * sends them there so they always see today's list, not one job in isolation.
 */
export default async function TechFieldPage({ params }: PageProps) {
  const { token } = await params;
  const job = await prisma.job.findFirst({
    where: { techToken: token },
    select: { id: true, technicianId: true },
  });
  if (job?.technicianId) {
    const appToken = await ensureTechAppToken(job.technicianId);
    redirect(`/tech/${appToken}/jobs/${job.id}`);
  }
  return <TechFieldClient token={token} />;
}
