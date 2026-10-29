# Brand lock

One identity, held for years. Changing anything here is a decision, not a styling edit,
and `scripts/brand-lock.test.mjs` fails until the change is made on purpose.

## The mark and the word

- The symbol is four blades around an open star. The word is ORVIUS, set in the traced letterforms in `src/lib/orvius-wordmark.ts`.
- The lockup is the symbol beside the word, in **one ink**. The ink is the page's text color: light on night surfaces, dark on day surfaces. There is no plaque, tile or outline behind it.
- The favicon and app icon are the one exception: a black mark on a white tile, because they sit on arbitrary OS backgrounds.
- Sizes: sm 1.35rem, md 1.65rem, lg 1.9rem, xl 3rem (`src/lib/brand-typography.ts`).

## Type

- Face: Geist. Reading weight 400. Nothing above 500 except the wordmark.
- Scale (measured from cursor.com on 23 Oct 2026): meta 12px, body 14px, lead 16px, name 22px, sentence 26px, section 36px, display 52px.
- Text has three levels on the dashboard: primary, secondary, mute. A new grey is a new decision.

## Color

- Ink on surface. One accent, used for the single thing that needs a decision. Status uses green, amber and red only for status.
- New colors come from tokens (`--ox-*`, `--ov-*`). `scripts/design-floor.test.mjs` caps hardcoded hex.

## Surfaces

- Hairline borders, no shadows, radius from the 0.25 / 0.5 / 0.75 / 1.25rem scale.
- One focus per screen: the sentence, then the one thing happening, then everything else quietly.
