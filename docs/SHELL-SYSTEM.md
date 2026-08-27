# Orvius Shell System

One company, two planes, shared chrome.

## Planes

| Plane | Background | Use |
|-------|------------|-----|
| **Void** | `#0A0B0A` | Marketing — home, pilot |
| **Chalk** | `#F2F1EC` | Product — dashboard, admin, demo, domains |

Accent **Flare** (`#E8461C`) is signal only — CTAs, labels, pulse. **Live** is success only.

## Components

| Component | Role |
|-----------|------|
| `ShellHeader` | Top nav — `plane="void"` or `"chalk"` |
| `MarketingShell` | Void wrapper + header + footer + profile menu |
| `AppShell` | Chalk product workspace + flare rule + profile menu |
| `ProfileMenu` | Claude-style bottom-left navigation (all pages) |
| `SiteFooter` | Void footer on marketing pages |
| `shell-primitives` | Panels, stats, badges, forms, lists |

## Rules

1. Never hardcode hex on pages — use Chromatics tokens (`void`, `chalk`, `flare`, etc.)
2. Marketing CTAs on void: `btn-on-void` / `btn-on-void-secondary`
3. Product CTAs on chalk: `btn-primary` / `btn-secondary`
4. Dark cards on void: `panel-void`
5. Product cards on chalk: `card`
6. Profile menu is the single navigation hub — do not add competing nav patterns

## File map

```
src/components/
  shell-header.tsx      — shared top bar
  marketing-shell.tsx   — void page wrapper
  app-shell.tsx         — product page wrapper
  profile-menu.tsx      — global menu
  site-footer.tsx       — marketing footer
  shell-primitives.tsx  — UI building blocks
src/lib/orvius-colors.ts — token source of truth
src/app/globals.css     — CSS tokens + utilities
```

## Shell mastery checklist

- [ ] Home + pilot feel like one void brand plane
- [ ] Dashboard + admin + demo + domains feel like one chalk workspace
- [ ] Profile menu identical behavior everywhere
- [ ] No orphan headers or duplicate nav patterns
- [ ] Forms, cards, badges use primitives only

*Last updated: 2026-08-27*
