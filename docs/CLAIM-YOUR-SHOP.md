# Claim your shop

Setup used to ask the owner to type what the internet already knows.
Since 2026-10-19 the first setup step starts with the shop as customers
find it:

1. Owner enters their website or "Name, City".
2. Orvius reads the site's schema.org markup (what Google reads), or
   Google Places when configured, and offers the match.
3. Picking it loads name, trade guess, address and real opening hours.
   The owner confirms; nothing found is presented as owner-typed —
   provenance is stored on the setup state (`imported.source`).
4. On the day step, imported hours appear as their own choice —
   "From your listing · Mon–Fri 7am–6pm …" — preselected. Keeping them
   confirms the exact week; picking a preset replaces it. Malformed or
   partial hours are never imported; the owner falls back to presets.

The lookup endpoint (`/api/onboarding/lookup`) already existed for the
post-checkout wizard; the turn-on flow now uses it first, where the
typing actually happened.
