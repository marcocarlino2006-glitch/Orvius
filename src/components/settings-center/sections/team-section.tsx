"use client";

import Link from "next/link";
import { RecordAvatar } from "@/components/record-avatar";
import { displayPhone } from "@/lib/customer";
import type { Technician } from "../settings-model";
import { TeamAccessGroup } from "../team-access-group";
import { ScGroup, ScRow } from "../settings-primitives";

export function TeamSection({ crew, onClose }: { crew: Technician[] | null; onClose: () => void }) {
  return (
    <>
      <TeamAccessGroup />
      <ScGroup title={crew ? `Technicians · ${crew.length}` : "Technicians"}>
        {crew === null ? (
          <p className="sc-muted sc-pad">Loading…</p>
        ) : crew.length === 0 ? (
          <ScRow label="No technicians yet" hint="Add your crew so Orvius can assign jobs." />
        ) : (
          crew.map((tech) => (
            <div key={tech.id} className="sc-row sc-person">
              <RecordAvatar name={tech.name} />
              <div className="sc-row-copy">
                <p className="sc-row-label">{tech.name}</p>
                <p className="sc-row-hint">{tech.phone ? displayPhone(tech.phone) : "No mobile on file"}</p>
              </div>
            </div>
          ))
        )}
      </ScGroup>
      <div className="sc-actions">
        <Link href="/dashboard/dispatch" className="sc-btn" onClick={onClose}>
          Manage crew and schedule
        </Link>
      </div>
    </>
  );
}
