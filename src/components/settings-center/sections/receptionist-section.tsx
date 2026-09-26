"use client";

import { DEFAULT_VOICE_ID, RECEPTIONIST_VOICES } from "@/lib/voices";
import { VoiceSampleButton } from "../settings-controls";
import { dollars, type Business, type PatchFn } from "../settings-model";
import { ScField, ScGroup, ScRow, ScSwitch } from "../settings-primitives";

export function ReceptionistSection({
  b,
  patch,
  setError,
}: {
  b: Business;
  patch: PatchFn;
  setError: (message: string) => void;
}) {
  return (
    <>
      <ScGroup>
        <ScRow stack label="Opening line" hint="The first thing every caller hears.">
          <ScField
            multiline
            ariaLabel="Opening line"
            value={b.greeting ?? ""}
            placeholder={`Thank you for calling ${b.name}. How can I help you today?`}
            onCommit={(v) => patch({ greeting: v.trim() })}
          />
        </ScRow>
        <ScRow label="Voice" hint="Callers hear this voice. Changes apply to the next call.">
          <select
            className="sc-input"
            aria-label="Receptionist voice"
            value={b.voiceId ?? DEFAULT_VOICE_ID}
            onChange={(e) => void patch({ voiceId: e.target.value })}
          >
            {RECEPTIONIST_VOICES.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.label} — {voice.description}
              </option>
            ))}
          </select>
          <VoiceSampleButton voiceId={b.voiceId ?? DEFAULT_VOICE_ID} />
        </ScRow>
        <ScRow
          label="Connect callers who ask for a person"
          hint="The receptionist takes their name and number, then transfers the call here. Leave empty to get a callback text instead."
        >
          <ScField
            type="tel"
            ariaLabel="Transfer number"
            value={b.transferPhone ?? ""}
            placeholder="+1 555 123 4567"
            onCommit={(v) => patch({ transferPhone: v.trim() || null })}
          />
        </ScRow>
        <ScRow
          label="Handle routine work"
          hint="Confirms upcoming appointments by text and assigns a job when one technician is clearly the right fit. Ties, emergencies, and safety calls still come to you."
        >
          <ScSwitch
            label="Handle routine work"
            checked={b.autopilot ?? true}
            onChange={(next) => void patch({ autopilot: next })}
          />
        </ScRow>
      </ScGroup>
      <ScGroup title="Your numbers">
        <ScRow label="Average ticket" hint="Estimates booked value on Command. Not money collected.">
          <span className="sc-affix">
            <span>$</span>
            <ScField
              narrow
              ariaLabel="Average ticket in dollars"
              inputMode="numeric"
              value={b.avgTicketCents ? String(Math.round(b.avgTicketCents / 100)) : ""}
              placeholder="285"
              onCommit={(v) => {
                const n = dollars(v);
                if (n != null && (n < 50 || n > 50000)) {
                  setError("Average ticket must be between $50 and $50,000.");
                  return false;
                }
                return patch({ avgTicketCents: n == null ? null : Math.round(n * 100) });
              }}
            />
          </span>
        </ScRow>
        <ScRow label="Missed calls a week before Orvius">
          <ScField
            narrow
            ariaLabel="Missed calls a week before Orvius"
            inputMode="numeric"
            value={b.baselineMissedCallsPerWeek != null ? String(b.baselineMissedCallsPerWeek) : ""}
            placeholder="12"
            onCommit={(v) => {
              const n = dollars(v);
              return patch({ baselineMissedCallsPerWeek: n == null ? null : Math.min(500, Math.round(n)) });
            }}
          />
        </ScRow>
        <ScRow label="Jobs booked a week before Orvius">
          <ScField
            narrow
            ariaLabel="Jobs booked a week before Orvius"
            inputMode="numeric"
            value={b.baselineJobsPerWeek != null ? String(b.baselineJobsPerWeek) : ""}
            placeholder="8"
            onCommit={(v) => {
              const n = dollars(v);
              return patch({ baselineJobsPerWeek: n == null ? null : Math.min(500, Math.round(n)) });
            }}
          />
        </ScRow>
      </ScGroup>
    </>
  );
}
