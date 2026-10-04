"use client";

import { useEffect, useState } from "react";
import {
  applyResolvedTheme,
  readThemeChoice,
  resolveTheme,
  storeThemeChoice,
  type ThemeChoice,
} from "@/lib/theme";
import { ScGroup, ScRow } from "./settings-primitives";

const CHOICES: Array<{ id: ThemeChoice; label: string }> = [
  { id: "night", label: "Dark" },
  { id: "day", label: "Light" },
  { id: "system", label: "System" },
];

export function AppearanceGroup() {
  const [choice, setChoice] = useState<ThemeChoice | null>(null);

  useEffect(() => setChoice(readThemeChoice()), []);

  function pick(next: ThemeChoice) {
    setChoice(next);
    storeThemeChoice(next);
    applyResolvedTheme(resolveTheme(next));
  }

  return (
    <ScGroup title="Appearance">
      <ScRow label="Theme" hint="Applies on this device, to the app and the website.">
        <div className="sc-segment" role="radiogroup" aria-label="Theme">
          {CHOICES.map((item) => (
            <button
              key={item.id}
              type="button"
              role="radio"
              aria-checked={choice === item.id}
              className={choice === item.id ? "is-active" : ""}
              onClick={() => pick(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </ScRow>
    </ScGroup>
  );
}
