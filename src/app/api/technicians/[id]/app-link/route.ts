import { personActor } from "@/lib/audit";
import { FieldError } from "@/lib/job-field";
import { withOffice } from "@/lib/office-route";
import { prisma } from "@/lib/prisma";
import { techAppUrl } from "@/lib/tech-app-link";
import { issueTechAppLink, revokeTechAppLink } from "@/lib/tech-app";

type Params = { params: Promise<{ id: string }> };

/** The link the technician already has, so copying it does not break theirs. */
export async function GET(_request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("dispatch", async ({ business }) => {
    const tech = await prisma.technician.findFirst({ where: { id, businessId: business.id }, select: { appToken: true } });
    if (!tech) throw new FieldError("Technician not found", 404);
    return { url: tech.appToken ? techAppUrl(tech.appToken) : null };
  });
}

/** A new app link for the technician, texted to them unless `send` is false. The old link stops working. */
export async function POST(request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("dispatch", async (session) => {
    const body = (await request.json().catch(() => ({}))) as { send?: boolean };
    const actor = personActor(session);
    return issueTechAppLink({ businessId: session.business.id, technicianId: id, send: body.send !== false, actorEmail: actor.actorEmail, actor: actor.actor === "owner" ? "owner" : "teammate" });
  });
}

export async function DELETE(_request: Request, { params }: Params) {
  const { id } = await params;
  return withOffice("dispatch", async (session) => {
    const actor = personActor(session);
    await revokeTechAppLink({ businessId: session.business.id, technicianId: id, actorEmail: actor.actorEmail, actor: actor.actor === "owner" ? "owner" : "teammate" });
    return { ok: true };
  });
}
