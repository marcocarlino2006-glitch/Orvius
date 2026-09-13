# Orvius Shell System

> **PERFECT-STANDARDS note:** Shipped chrome is cool industrial paper (`#F1F3F6`), graphite void (`#0C1016`), copper signal (`#C4783A`) — see `src/lib/orvius-colors.ts`. Older cream/orange/flare docs are obsolete.

One company, two planes, shared chrome.

## Planes

| Plane | Background | Use |
|-------|------------|-----|
| **Paper** | `#F1F3F6` | Product — dashboard, settings, billing |
| **Void** | `#0C1016` | Marketing accents, night instruments |

Accent **Copper** (`#C4783A`) is signal. **Live** (`#1A9B6E`) is success. **Flare** (`#CF2D56`) is danger only.

## Components

| Component | Role |
|-----------|------|
| `PremiumNav` / marketing shell | Public chrome |
| `OsShell` | Product workspace |
| Shell primitives | Panels, alerts, buttons |

## Rules

1. Prefer tokens from `orvius-colors.ts` / CSS variables — do not invent new hex on pages.
2. Wedge-first nav: Command / Inbox / Calls before deeper OS rings.
3. No founder instruments on owner Settings.
4. `globals.css` eras must be deleted, not layered — see PERFECT-STANDARDS B6.
