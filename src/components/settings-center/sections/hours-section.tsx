"use client";

import {
  parseServicesForm,
  parseZipsForm,
  serializeServicesForm,
  serializeZipsForm,
  WEEKDAYS,
  weekdayLabel,
  type HoursForm,
} from "@/lib/shop-hours-form";
import type { Business, PatchFn } from "../settings-model";
import { ScField, ScGroup, ScRow, ScSwitch } from "../settings-primitives";

type Weekday = (typeof WEEKDAYS)[number];

export function HoursSection({
  b,
  patch,
  hours,
  updateDay,
}: {
  b: Business;
  patch: PatchFn;
  hours: HoursForm;
  updateDay: (day: Weekday, change: Partial<HoursForm[Weekday]>) => void;
}) {
  return (
    <>
      <ScGroup title="Open hours">
        {WEEKDAYS.map((day) => {
          const entry = hours[day];
          return (
            <div key={day} className="sc-row sc-hours-row">
              <div className="sc-row-copy">
                <p className="sc-row-label">{weekdayLabel(day)}</p>
              </div>
              <div className="sc-row-control">
                {entry.closed ? (
                  <span className="sc-muted">Closed</span>
                ) : (
                  <span className="sc-hours-times">
                    <input
                      type="time"
                      className="sc-input sc-time"
                      value={entry.open}
                      onChange={(e) => updateDay(day, { open: e.target.value })}
                      aria-label={`${weekdayLabel(day)} open`}
                    />
                    <span className="sc-muted">to</span>
                    <input
                      type="time"
                      className="sc-input sc-time"
                      value={entry.close}
                      onChange={(e) => updateDay(day, { close: e.target.value })}
                      aria-label={`${weekdayLabel(day)} close`}
                    />
                  </span>
                )}
                <ScSwitch
                  label={`Open on ${weekdayLabel(day)}`}
                  checked={!entry.closed}
                  onChange={(open) => updateDay(day, { closed: !open })}
                />
              </div>
            </div>
          );
        })}
      </ScGroup>
      <ScGroup title="Work you take">
        <ScRow stack label="Services" hint="One per line. Written into the receptionist's service list.">
          <ScField
            multiline
            rows={4}
            ariaLabel="Services"
            value={parseServicesForm(b.servicesJson)}
            placeholder={"AC repair\nHeating repair\nMaintenance"}
            onCommit={(v) => patch({ servicesJson: serializeServicesForm(v) })}
          />
        </ScRow>
        <ScRow
          stack
          label="Service ZIPs"
          hint="Comma-separated. Leads outside these stay on the board instead of booking."
        >
          <ScField
            ariaLabel="Service ZIPs"
            value={parseZipsForm(b.serviceZipsJson)}
            placeholder="33101, 33109, 33139"
            inputMode="numeric"
            autoComplete="off"
            onCommit={(v) => patch({ serviceZipsJson: serializeZipsForm(v) })}
          />
        </ScRow>
      </ScGroup>
    </>
  );
}
