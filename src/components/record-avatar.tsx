const HUES = [212, 262, 330, 24, 152, 190, 45, 290];

function initials(name: string) {
  const words = name.replace(/[^\p{L}\p{N} ]/gu, " ").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "";
  if (/^\d/.test(words[0])) return "#";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** One rule for every avatar: a name's first and last initial, else the part of the email before the @. */
export function personInitials(name: string | null | undefined, email?: string | null): string {
  const source = name?.trim() || email?.trim() || "";
  const label = source.includes("@") ? source.split("@")[0].replace(/[._+-]+/g, " ") : source;
  return initials(label) || "?";
}

function hue(name: string) {
  let h = 0;
  for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return HUES[h % HUES.length];
}

/** A person's initials on a quiet tint — stable per name, so a caller keeps their colour. */
export function RecordAvatar({
  name,
  email,
  tone,
}: {
  name: string | null | undefined;
  email?: string | null;
  tone?: "flare";
}) {
  const label = name?.trim() || email?.trim() || "?";
  const text = personInitials(name, email);
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
