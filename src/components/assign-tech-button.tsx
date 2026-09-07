"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type TechOption = { id: string; name: string };

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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!technicians.length) {
    return (
      <Link
        href="/dashboard/dispatch"
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

    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: techId }),
      });
      const data = (await res.json().catch(() => null)) as {
        error?: string;
        techSms?: { sent: boolean; reason?: string };
      } | null;
      if (!res.ok) {
        throw new Error(data?.error ?? "Assign failed");
      }
      if (data?.techSms && !data.techSms.sent && data.techSms.reason === "no_phone") {
        setError("Assigned — add mobile on Dispatch so they get SMS");
      }
      onAssigned?.();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assign failed");
    } finally {
      setLoading(false);
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
              ? `Assign ${technicians[0]!.name}`
              : "Assign"}
        </button>
        {error ? <span className="assign-tech-error font-sans">{error}</span> : null}
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
      {error ? <p className="assign-tech-error font-sans">{error}</p> : null}
    </div>
  );
}
