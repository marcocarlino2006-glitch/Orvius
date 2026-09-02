"use client";

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
  className = "today-priority-btn",
  compact = false,
}: AssignTechButtonProps) {
  const router = useRouter();
  const [techId, setTechId] = useState(technicians[0]?.id ?? "");
  const [loading, setLoading] = useState(false);

  if (!technicians.length) return null;

  async function assign(event: React.MouseEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (!techId || loading) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/jobs/${jobId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ technicianId: techId }),
      });
      if (!res.ok) throw new Error("assign failed");
      onAssigned?.();
      router.refresh();
    } catch {
      /* dispatch page fallback */
    } finally {
      setLoading(false);
    }
  }

  if (compact) {
    return (
      <div className={`assign-tech-inline ${className}`} onClick={(e) => e.stopPropagation()}>
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
        <button type="button" className="assign-tech-btn font-sans" disabled={loading} onClick={assign}>
          {loading ? "…" : "Assign"}
        </button>
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
        className={`today-priority-btn today-priority-btn-primary ${className}`}
        disabled={loading}
        onClick={assign}
      >
        {loading ? "Assigning…" : "Assign tech"}
      </button>
    </div>
  );
}
