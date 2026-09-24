const HUES = [212, 262, 330, 24, 152, 190, 45, 290];

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (/^\d/.test(words[0])) return "#";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/** A person's initials on a quiet tint — stable per name, so a caller keeps their colour. */
export function RecordAvatar({ name, tone }: { name: string | null | undefined; tone?: "flare" }) {
  const label = name?.trim() || "?";
  const text = initials(label) || "?";
  return (
    <span
      className={`record-avatar${tone === "flare" ? " is-flare" : ""}`}
      style={{ ["--avatar-hue" as string]: String(hue(label)) }}
      aria-hidden
    >
      {text}
    </span>
  );
}
