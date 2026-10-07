import assert from "node:assert/strict";
import test from "node:test";
import { PrismaClient } from "@prisma/client";
import { readFileSync } from "node:fs";

const { executeProposal } = await import("../src/lib/copilot-execute.ts");
const { undoProposal } = await import("../src/lib/copilot-undo.ts");

const prisma = new PrismaClient();
const uid = () => Math.random().toString(36).slice(2, 10);

test("approving an assignment can be undone, and only once", async () => {
  const shop = await prisma.business.create({
    data: { name: "Undo HVAC", slug: `undo-${Date.now()}-${uid()}`, environment: "test", trade: "HVAC", billingStatus: "active", billingPlan: "pro" },
  });
  try {
    const ana = await prisma.technician.create({ data: { businessId: shop.id, name: "Ana", skillsJson: "[]" } });
    const job = await prisma.job.create({
      data: { businessId: shop.id, title: "AC leak", status: "scheduled", scheduledAt: new Date(Date.now() + 86400000) },
    });
    const proposal = await prisma.copilotAction.create({
      data: { businessId: shop.id, action: "assign_tech", paramsJson: JSON.stringify({ jobId: job.id, technicianId: ana.id }), preview: "Assign Ana", status: "proposed" },
    });
    const ran = await executeProposal({ business: shop, proposalId: proposal.id });
    assert.equal(ran.ok, true);
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId, ana.id);

    const undone = await undoProposal({ business: shop, proposalId: proposal.id });
    assert.equal(undone.ok, true);
    assert.equal((await prisma.job.findUniqueOrThrow({ where: { id: job.id } })).technicianId, null);
    assert.equal((await prisma.copilotAction.findUniqueOrThrow({ where: { id: proposal.id } })).status, "undone");
    assert.equal(await prisma.auditEvent.count({ where: { jobId: job.id, action: "copilot.undone" } }), 1);

    const again = await undoProposal({ business: shop, proposalId: proposal.id });
    assert.equal(again.ok, true);
    assert.match(again.summary, /Already undone/);
  } finally {
    await prisma.business.delete({ where: { id: shop.id } }).catch(() => {});
  }
});

test("Ask Undo is on the plan toast and the Ask page", () => {
  const board = readFileSync(new URL("../src/components/command-board.tsx", import.meta.url), "utf8");
  const ask = readFileSync(new URL("../src/components/copilot-actions.tsx", import.meta.url), "utf8");
  const route = readFileSync(new URL("../src/app/api/copilot/route.ts", import.meta.url), "utf8");
  assert.match(board, /mode=undo/);
  assert.match(ask, /Undo/);
  assert.match(route, /mode === "undo"/);
});
