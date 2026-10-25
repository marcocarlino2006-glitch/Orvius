import { zip3FromAddress } from "@/lib/network-density";
import { prisma } from "@/lib/prisma";

/**
 * Stored on networkZip3 when a shop turns the network off before a ZIP is known.
 * A real region is three digits, so this never matches a partner. Null means the shop has not chosen.
 */
export const NETWORK_DECLINED = "off";

export function isZip3(value: string | null | undefined): value is string {
  return Boolean(value && /^\d{3}$/.test(value));
}

/** Off, and no region and no decline saved. An explicit off keeps the region or NETWORK_DECLINED. */
export function neverChoseNetwork(shop: { networkOn: boolean; networkZip3: string | null }) {
  return !shop.networkOn && shop.networkZip3 == null;
}

/** The shop's region: the address ZIP, else the first ZIP it serves. */
export function regionFrom(address: string | null | undefined, serviceZipsJson: string | null | undefined): string | null {
  const fromAddress = zip3FromAddress(address);
  if (fromAddress) return fromAddress;
  if (!serviceZipsJson) return null;
  try {
    const zips = JSON.parse(serviceZipsJson) as unknown;
    if (!Array.isArray(zips)) return zip3FromAddress(serviceZipsJson);
    return zip3FromAddress(zips.map(String).join(" "));
  } catch {
    return zip3FromAddress(serviceZipsJson);
  }
}

/** A new shop takes jobs from nearby shops, and offers its own, once a ZIP is known. */
export function networkForNewShop(address: string | null | undefined, serviceZipsJson?: string | null) {
  return { networkOn: true, networkZip3: regionFrom(address, serviceZipsJson) };
}

/** True when go-live should leave the switch where the owner put it. */
export function shopKeptNetworkChoice(shop: { networkOn: boolean; networkZip3: string | null }) {
  return shop.networkOn || shop.networkZip3 != null;
}

export type NetworkSave = { networkOn: boolean; networkZip3: string | null; error?: string };

const ZIP_FIRST = "Add your shop address with its ZIP code first, so nearby shops can be matched.";

/**
 * A settings save. A shop that never chose turns on when a ZIP is now known.
 * Turning the switch off is kept, including before a ZIP exists.
 */
export function resolveNetworkSave(
  existing: { networkOn: boolean; networkZip3: string | null },
  input: { networkOn?: boolean; address: string | null; serviceZipsJson: string | null },
): NetworkSave {
  const derived = regionFrom(input.address, input.serviceZipsJson);
  const storedZip = isZip3(existing.networkZip3) ? existing.networkZip3 : null;

  if (input.networkOn === false) {
    return { networkOn: false, networkZip3: storedZip ?? NETWORK_DECLINED };
  }

  const turnOn = input.networkOn === true || (input.networkOn === undefined && neverChoseNetwork(existing) && Boolean(derived));
  const networkOn = turnOn ? true : existing.networkOn;
  if (!networkOn) return { networkOn: false, networkZip3: existing.networkZip3 };

  const networkZip3 = derived ?? storedZip;
  if (input.networkOn === true && !networkZip3) {
    return { networkOn: existing.networkOn, networkZip3: existing.networkZip3, error: ZIP_FIRST };
  }
  return { networkOn: true, networkZip3 };
}

/** Shops that never chose, and whose address or service area has a ZIP, start receiving network jobs. */
export async function turnOnNeverChosenShops() {
  let turnedOn = 0;
  let cursor: string | undefined;
  for (let batch = 0; batch < 50; batch++) {
    const shops = await prisma.business.findMany({
      where: { networkOn: false, networkZip3: null, ...(cursor ? { id: { gt: cursor } } : {}) },
      select: { id: true, address: true, serviceZipsJson: true },
      orderBy: { id: "asc" },
      take: 200,
    });
    if (!shops.length) break;
    cursor = shops[shops.length - 1].id;
    for (const shop of shops) {
      const zip3 = regionFrom(shop.address, shop.serviceZipsJson);
      if (!zip3) continue;
      const saved = await prisma.business.updateMany({
        where: { id: shop.id, networkOn: false, networkZip3: null },
        data: { networkOn: true, networkZip3: zip3 },
      });
      turnedOn += saved.count;
    }
  }
  return turnedOn;
}
