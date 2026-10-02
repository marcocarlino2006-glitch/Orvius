/*
  Where a shop came from, so posts and channels can be judged by the shops
  they bring in rather than by views. Edge-safe: middleware writes it.

  First touch wins for the channel (the post that brought them), except a
  referral code, which always wins — a shop sending a friend its link is the
  reason that friend is here, whatever they read before.
*/

export const ACQUISITION_COOKIE = "orv_src";
export const ACQUISITION_MAX_AGE = 90 * 24 * 60 * 60;

export type Acquisition = {
  /** Referring shop's slug, from /r/<slug> or ?ref=. */
  ref?: string;
  /** Where on the referring shop's surfaces it came from: link, booking, confirm. */
  via?: string;
  src?: string;
  med?: string;
  cmp?: string;
  /** Referring site when it wasn't us. */
  host?: string;
  land?: string;
  at: string;
};

const clean = (v: string | null | undefined, max = 60) =>
  v ? v.trim().toLowerCase().replace(/[^a-z0-9._\-]/g, "").slice(0, max) || undefined : undefined;

export function parseAcquisition(raw: string | null | undefined): Acquisition | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Acquisition;
    return parsed && typeof parsed === "object" && typeof parsed.at === "string" ? parsed : null;
  } catch {
    return null;
  }
}

/** The cookie value to set for this visit, or null to leave it as it is. */
export function nextAcquisition(params: {
  url: URL;
  referer: string | null;
  existing: Acquisition | null;
  ownHosts: string[];
  now?: Date;
}): Acquisition | null {
  const { url, existing } = params;
  const q = url.searchParams;
  const pathRef = url.pathname.match(/^\/r\/([a-z0-9-]{2,80})\/?$/i)?.[1];
  const ref = clean(pathRef ?? q.get("ref"), 80);
  let host: string | undefined;
  try {
    const h = params.referer ? new URL(params.referer).hostname.toLowerCase().replace(/^www\./, "") : undefined;
    host = h && !params.ownHosts.some((own) => h === own || h.endsWith(`.${own}`)) ? clean(h, 80) : undefined;
  } catch {
    host = undefined;
  }
  const touch: Acquisition = {
    ...(ref ? { ref, via: clean(q.get("via"), 20) ?? "link" } : {}),
    ...(clean(q.get("utm_source")) ? { src: clean(q.get("utm_source")) } : {}),
    ...(clean(q.get("utm_medium")) ? { med: clean(q.get("utm_medium")) } : {}),
    ...(clean(q.get("utm_campaign")) ? { cmp: clean(q.get("utm_campaign")) } : {}),
    ...(host ? { host } : {}),
    land: url.pathname.slice(0, 80),
    at: (params.now ?? new Date()).toISOString(),
  };
  const meaningful = Boolean(touch.ref || touch.src || touch.host);
  if (!existing) return meaningful ? touch : null;
  if (touch.ref && touch.ref !== existing.ref) return { ...existing, ref: touch.ref, via: touch.via };
  return null;
}

/** One word for the scoreboard: which channel brought this shop. */
export function acquisitionChannel(acq: Acquisition | null): string {
  if (!acq) return "direct";
  if (acq.ref) return "referral";
  if (acq.src) return acq.src;
  if (acq.host) {
    if (/google\./.test(acq.host)) return "google";
    if (/(^|\.)(facebook|fb|instagram)\.com$|^l\.facebook\.com$/.test(acq.host)) return "facebook";
    if (/tiktok\.com$/.test(acq.host)) return "tiktok";
    if (/(youtube\.com|youtu\.be)$/.test(acq.host)) return "youtube";
    if (/reddit\.com$/.test(acq.host)) return "reddit";
    if (/(^|\.)(x|twitter|t)\.(com|co)$/.test(acq.host)) return "x";
    if (/linkedin\.com$|lnkd\.in$/.test(acq.host)) return "linkedin";
    return acq.host;
  }
  return "direct";
}

/** Shops counted by the channel that brought them, biggest first. */
export function countChannels(rawAcquisitions: Array<string | null | undefined>) {
  const counts = new Map<string, number>();
  for (const raw of rawAcquisitions) {
    const channel = acquisitionChannel(parseAcquisition(raw));
    counts.set(channel, (counts.get(channel) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([channel, count]) => ({ channel, count }))
    .sort((a, b) => b.count - a.count || a.channel.localeCompare(b.channel));
}

export function signupChannelText(channels: Array<{ channel: string; count: number }>) {
  return channels.length ? channels.map((c) => `${c.channel} ${c.count}`).join(" · ") : "none yet";
}
