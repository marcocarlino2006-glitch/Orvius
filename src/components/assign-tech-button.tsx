"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useInstantAction } from "@/components/instant-action";

export type TechOption = { id: string; name: string };

/** Crews seeded before the owner row was named "Owner" carry "<Shop name> owner". */
function buttonName(name: string) {
  return /\sowner$/i.test(name) ? "owner" : name;
}

type AssignTechButtonProps = {
  jobId: string;
  technicians: TechOption[];
  onAssigned?: () => void;
  className?: string;
  compact?: boolean;
};

export function AssignTechButton({
  jobId,
  technicians,
  onAssigned,
  className = "",
  compact = false,
}: AssignTechButtonProps) {
  const router = useRouter();
  const [techId, setTechId] = useState(technicians[0]?.id ?? "");
  const { pending: loading, error, run } = useInstantAction();
  const [noPhone, setNoPhone] = useState(false);

  if (!technicians.length) {
    return (
      <Link
        href="/dashboard/schedule"
        className={`assign-tech-empty font-sans ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        Add a tech
      </Link>
    );
  }

  async function assign(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!techId || loading) return;

    const name = technicians.find((t) => t.id === techId)?.name ?? "Tech";
    setNoPhone(false);
    try {
      await run(
        async () => {
          const res = await fetch(`/api/jobs/${jobId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ technicianId: techId }),
          });
          const data = (await res.json().catch(() => null)) as {
            error?: string;
            techSms?: { sent: boolean; reason?: string };
          } | null;
          if (!res.ok) throw new Error(data?.error ?? "That didn't go through — nobody was assigned");
          if (data?.techSms && !data.techSms.sent && data.techSms.reason === "no_phone") {
            setNoPhone(true);
          }
          onAssigned?.();
          router.refresh();
        },
        {
          pendingTitle: `Assigning ${buttonName(name)}…`,
          doneTitle: `${name} is on it`,
        },
      );
    } catch {
      /* The hook already toasted the failure. */
    }
  }

  if (compact || technicians.length === 1) {
    return (
      <div
        className={`assign-tech-inline ${className}`.trim()}
        onClick={(e) => e.stopPropagation()}
      >
        {technicians.length > 1 ? (
          <select
            className="assign-tech-select font-sans"
            value={techId}
            onChange={(e) => setTechId(e.target.value)}
            aria-label="Assign technician"
          >
            {technicians.map((tech) => (
              <option key={tech.id} value={tech.id}>
                {tech.name}
              </option>
            ))}
          </select>
        ) : null}
        <button
          type="button"
          className="assign-tech-btn font-sans"
          disabled={loading}
          onClick={assign}
        >
          {loading
            ? "…"
            : technicians.length === 1
              ? `Assign ${buttonName(technicians[0]!.name)}`
              : "Assign"}
        </button>
        {error ? <span className="assign-tech-error font-sans">{error}</span> : noPhone ? <span className="assign-tech-note font-sans">On it — add their mobile on Dispatch so the text goes out</span> : null}
      </div>
    );
  }

  return (
    <div className="assign-tech-block font-sans" onClick={(e) => e.stopPropagation()}>
      <select
        className="assign-tech-select font-sans"
        value={techId}
        onChange={(e) => setTechId(e.target.value)}
        aria-label="Assign technician"
      >
        {technicians.map((tech) => (
          <option key={tech.id} value={tech.id}>
            {tech.name}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="assign-tech-btn assign-tech-btn--block font-sans"
        disabled={loading}
        onClick={assign}
      >
        {loading ? "Assigning…" : "Assign tech"}
      </button>
      {error ? <p className="assign-tech-error font-sans">{error}</p> : noPhone ? <p className="assign-tech-note font-sans">On it — add their mobile on Dispatch so the text goes out</p> : null}
    </div>
  );
}
