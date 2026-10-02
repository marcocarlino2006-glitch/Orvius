import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { logWarn } from "@/lib/logger";
import { inferTradeFromBusiness, type Trade } from "@/lib/trades";

/*
  An owner shouldn't type what their website or Google listing already says.
  Given a site or a "name, city" search, this returns the shop's name, address,
  hours and a trade guess, so the receptionist knows the real hours on the
  first call instead of a Mon–Fri 8–6 default.

  Websites are read from schema.org markup (what Google itself reads), then
  the page title. Google Places is used when GOOGLE_PLACES_API_KEY is set.
*/

export type ShopFound = {
  name: string;
  address: string | null;
  phone: string | null;
  website: string | null;
  /** Same shape as Business.hoursJson; null when the source had no hours. */
  hoursJson: string | null;
  trade: Trade | null;
  source: "website" | "google";
};

const DAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"] as const;
type Day = (typeof DAYS)[number];
type Hours = Record<Day, { open: string; close: string; closed?: boolean }>;

/** A reason worded for the owner; anything else is reported generically. */
class LookupError extends Error {}

const MAX_BYTES = 1_500_000;
const TIMEOUT_MS = 5_000;

export function placesConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim());
}

export function looksLikeWebsite(query: string) {
  const q = query.trim();
  return /^https?:\/\//i.test(q) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/\S*)?$/i.test(q);
}

/** Loopback, private, link-local, CGNAT and metadata ranges are never fetched. */
export function isPublicAddress(ip: string) {
  if (isIP(ip) === 4) {
    const [a, b] = ip.split(".").map(Number);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return false;
    if (a === 169 && b === 254) return false;
    if (a === 172 && b >= 16 && b <= 31) return false;
    if (a === 192 && b === 168) return false;
    if (a === 100 && b >= 64 && b <= 127) return false;
    return true;
  }
  if (isIP(ip) === 6) {
    const v = ip.toLowerCase();
    if (v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80")) return false;
    if (v.startsWith("::ffff:")) return isPublicAddress(v.slice(7));
    return true;
  }
  return false;
}

async function assertPublicHost(url: URL) {
  if (url.protocol !== "http:" && url.protocol !== "https:") throw new LookupError("Only web addresses can be read.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new LookupError("That address can't be read.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true });
  if (!addresses.length || !addresses.every((a) => isPublicAddress(a.address))) {
    throw new LookupError("That address can't be read.");
  }
}

async function fetchPage(raw: string, fetcher: typeof fetch): Promise<{ html: string; url: string }> {
  let url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  for (let hop = 0; hop < 4; hop += 1) {
    await assertPublicHost(url);
    const res = await fetcher(url, {
      redirect: "manual",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { "user-agent": "OrviusSetup/1.0 (+https://orvius.im)", accept: "text/html" },
    });
    const next = res.headers.get("location");
    if (res.status >= 300 && res.status < 400 && next) {
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new LookupError("That site didn't load.");
    if (!/text\/html|application\/xhtml/i.test(res.headers.get("content-type") ?? "text/html")) {
      throw new LookupError("That address isn't a web page.");
    }
    const reader = res.body?.getReader();
    if (!reader) return { html: await res.text(), url: url.toString() };
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (size < MAX_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      size += value.byteLength;
    }
    await reader.cancel().catch(() => undefined);
    return { html: new TextDecoder().decode(Buffer.concat(chunks)), url: url.toString() };
  }
  throw new LookupError("That site redirects too many times.");
}

const decode = (s: string) =>
  s
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    .replace(/\s+/g, " ")
    .trim();

function meta(html: string, key: string) {
  const re = new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*>`, "i");
  const tag = html.match(re)?.[0];
  return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "") || null : null;
}

type Json = Record<string, unknown>;

function jsonLdNodes(html: string): Json[] {
  const nodes: Json[] = [];
  const scripts = html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi);
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      nodes.push(v as Json);
      const graph = (v as Json)["@graph"];
      if (graph) walk(graph);
    }
  };
  for (const [, body] of scripts) {
    try {
      walk(JSON.parse(body.trim()));
    } catch {
      /* A broken block on someone's site is not our failure. */
    }
  }
  return nodes;
}

const BUSINESS_TYPE =
  /LocalBusiness|HomeAndConstructionBusiness|HVACBusiness|Plumber|Electrician|RoofingContractor|GeneralContractor|Locksmith|MovingCompany|AutoRepair|Dentist|MedicalBusiness|Physician|Attorney|LegalService|RealEstateAgent|BeautySalon|DaySpa|HairSalon|ProfessionalService|Organization/;

function typesOf(node: Json) {
  const t = node["@type"];
  return (Array.isArray(t) ? t : [t]).filter((x): x is string => typeof x === "string");
}

function addressText(a: unknown): string | null {
  if (typeof a === "string") return decode(a) || null;
  if (!a || typeof a !== "object") return null;
  const o = a as Json;
  const parts = [o.streetAddress, o.addressLocality, [o.addressRegion, o.postalCode].filter(Boolean).join(" ")]
    .filter((p): p is string => typeof p === "string" && p.trim().length > 0)
    .map((p) => p.trim());
  return parts.length ? parts.join(", ") : null;
}

const DAY_CODES: Record<string, Day> = { mo: "monday", tu: "tuesday", we: "wednesday", th: "thursday", fr: "friday", sa: "saturday", su: "sunday" };
const ORDER: Day[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];

function emptyHours(): Hours {
  return Object.fromEntries(DAYS.map((d) => [d, { closed: true, open: "00:00", close: "00:00" }])) as Hours;
}

const hhmm = (t: unknown) => (typeof t === "string" && /^\d{1,2}:\d{2}/.test(t) ? t.slice(0, 5).padStart(5, "0") : null);

/** schema.org openingHours ("Mo-Fr 08:00-18:00") or openingHoursSpecification → hoursJson. */
export function hoursFromSchema(node: Json): string | null {
  const hours = emptyHours();
  let any = false;
  const set = (day: Day, open: string, close: string) => {
    hours[day] = { open, close };
    any = true;
  };

  const specs = node.openingHoursSpecification;
  for (const spec of (Array.isArray(specs) ? specs : specs ? [specs] : []) as Json[]) {
    const open = hhmm(spec.opens);
    const close = hhmm(spec.closes);
    if (!open || !close) continue;
    const days = (Array.isArray(spec.dayOfWeek) ? spec.dayOfWeek : [spec.dayOfWeek]) as unknown[];
    for (const d of days) {
      const name = typeof d === "string" ? d.replace(/^https?:\/\/schema\.org\//i, "").toLowerCase() : "";
      if ((DAYS as readonly string[]).includes(name)) set(name as Day, open, close);
    }
  }

  const text = node.openingHours;
  for (const line of (Array.isArray(text) ? text : text ? [text] : []) as unknown[]) {
    if (typeof line !== "string") continue;
    const m = line.trim().match(/^([A-Za-z,\- ]+)\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
    if (!m) continue;
    const [, daysPart, open, close] = m;
    for (const piece of daysPart.toLowerCase().split(",").map((p) => p.trim())) {
      const [from, to] = piece.split("-").map((p) => DAY_CODES[p.trim().slice(0, 2)]);
      if (!from) continue;
      const span = to ? ORDER.slice(ORDER.indexOf(from), ORDER.indexOf(to) + 1) : [from];
      for (const day of span) set(day, hhmm(open)!, hhmm(close)!);
    }
  }
  return any ? JSON.stringify(hours) : null;
}

function cleanTitle(title: string) {
  return decode(title).split(/\s+[|\-–—:]\s+/)[0]?.trim() ?? "";
}

/** Reads a shop's own site. Exported for tests with a stand-in fetch. */
export function shopFromHtml(html: string, url: string): ShopFound | null {
  const nodes = jsonLdNodes(html);
  const node = nodes.find((n) => typesOf(n).some((t) => BUSINESS_TYPE.test(t)) && typeof n.name === "string");
  const title = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const name =
    (node && decode(node.name as string)) || meta(html, "og:site_name") || (title ? cleanTitle(title) : "");
  if (!name || name.length < 2) return null;
  const description = meta(html, "description") ?? meta(html, "og:description") ?? "";
  const tel = html.match(/href=["']tel:([+\d().\-\s]{10,20})["']/i)?.[1]?.trim() ?? null;
  return {
    name: name.slice(0, 120),
    address: node ? addressText(node.address) : null,
    phone: (node && typeof node.telephone === "string" ? node.telephone.trim() : null) ?? tel,
    website: url,
    hoursJson: node ? hoursFromSchema(node) : null,
    trade: inferTradeFromBusiness({ name: `${name} ${node ? typesOf(node).join(" ") : ""} ${description}` }),
    source: "website",
  };
}

type PlacesPeriod = { open?: { day?: number; hour?: number; minute?: number }; close?: { day?: number; hour?: number; minute?: number } };

export function hoursFromPlaces(periods: PlacesPeriod[] | undefined): string | null {
  if (!periods?.length) return null;
  const hours = emptyHours();
  const t = (p?: { hour?: number; minute?: number }) =>
    `${String(p?.hour ?? 0).padStart(2, "0")}:${String(p?.minute ?? 0).padStart(2, "0")}`;
  for (const p of periods) {
    if (p.open?.day == null) continue;
    const day = DAYS[p.open.day];
    if (!p.close) hours[day] = { open: "00:00", close: "23:59" };
    else hours[day] = { open: t(p.open), close: p.close.day === p.open.day ? t(p.close) : "23:59" };
  }
  return JSON.stringify(hours);
}

async function fromPlaces(query: string, fetcher: typeof fetch): Promise<ShopFound[]> {
  const res = await fetcher("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": process.env.GOOGLE_PLACES_API_KEY!.trim(),
      "x-goog-fieldmask":
        "places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.regularOpeningHours,places.primaryType,places.types",
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 3, regionCode: "US" }),
  });
  if (!res.ok) throw new Error(`Google lookup failed (${res.status})`);
  const json = (await res.json()) as {
    places?: Array<{
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      regularOpeningHours?: { periods?: PlacesPeriod[] };
      primaryType?: string;
      types?: string[];
    }>;
  };
  return (json.places ?? [])
    .filter((p) => p.displayName?.text)
    .map((p) => ({
      name: p.displayName!.text!.slice(0, 120),
      address: p.formattedAddress?.replace(/, USA$/, "") ?? null,
      phone: p.nationalPhoneNumber ?? null,
      website: p.websiteUri ?? null,
      hoursJson: hoursFromPlaces(p.regularOpeningHours?.periods),
      trade: inferTradeFromBusiness({
        name: `${p.displayName!.text} ${[p.primaryType, ...(p.types ?? [])].join(" ").replace(/_/g, " ")}`,
      }),
      source: "google" as const,
    }));
}

/** Up to three matches for a website or a "name, city" search. Never throws for a miss. */
export async function lookupShop(query: string, fetcher: typeof fetch = fetch): Promise<{ found: ShopFound[]; reason?: string }> {
  const q = query.trim().slice(0, 200);
  if (q.length < 3) return { found: [], reason: "Type a little more." };
  try {
    if (looksLikeWebsite(q)) {
      const page = await fetchPage(q, fetcher);
      const shop = shopFromHtml(page.html, page.url);
      return shop ? { found: [shop] } : { found: [], reason: "Couldn't find the shop's details on that page." };
    }
    if (!placesConfigured()) return { found: [], reason: "Paste your website to fill this in." };
    const found = await fromPlaces(q, fetcher);
    return found.length ? { found } : { found: [], reason: "No match on Google. Try adding your city." };
  } catch (error) {
    logWarn("shop_lookup.failed", { error: error instanceof Error ? error.message : "unknown" });
    return { found: [], reason: error instanceof LookupError ? error.message : "Couldn't read that site. Check the address, or fill it in below." };
  }
}
