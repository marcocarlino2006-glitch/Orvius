"use client";

import {
  JOB_LENGTH_OPTIONS,
  jobLengthLabel,
  jobLengthServices,
  parseJobLengths,
} from "@/lib/trade-playbooks";
import type { Business, PatchFn } from "./settings-model";
import { ScGroup, ScRow } from "./settings-primitives";

/**
 * How long each kind of job takes at this shop. Every booking path reads it,
 * so a 45-minute drain call doesn't hold two hours of a technician's day.
 */
export function JobLengthsGroup({ b, patch }: { b: Business; patch: PatchFn }) {
  const services = jobLengthServices(b);
  if (!services.length) return null;
  const lengths = parseJobLengths(b.jobLengthsJson);

  function set(key: string, defaultMin: number, value: number) {
    const next = { ...lengths };
    if (value === defaultMin) delete next[key];
    else next[key] = value;
    void patch({ jobLengthsJson: JSON.stringify(next) });
  }

  return (
    <ScGroup title="Job lengths">
      <p className="sc-muted sc-group-note">
        How much of a technician&apos;s day each kind of job holds when it&apos;s booked. Calls, online booking
        and the schedule all use these.
      </p>
      {services.map((s) => {
        const options: number[] = JOB_LENGTH_OPTIONS.includes(s.defaultMin as (typeof JOB_LENGTH_OPTIONS)[number])
          ? [...JOB_LENGTH_OPTIONS]
          : [...JOB_LENGTH_OPTIONS, s.defaultMin].sort((x, y) => x - y);
        const value = lengths[s.key] ?? s.defaultMin;
        return (
          <ScRow key={s.key} label={s.label} hint={value === s.defaultMin ? "Standard" : `Standard is ${jobLengthLabel(s.defaultMin)}`}>
            <select
              className="sc-input sc-input--select sc-input--length"
              aria-label={`${s.label} job length`}
              value={value}
              onChange={(e) => set(s.key, s.defaultMin, Number(e.target.value))}
            >
              {options.map((min) => (
                <option key={min} value={min}>
                  {jobLengthLabel(min)}
                </option>
              ))}
            </select>
          </ScRow>
        );
      })}
    </ScGroup>
  );
}
