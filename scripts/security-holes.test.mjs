#!/usr/bin/env node
/*
 * Holes an attacker or a wrong teammate could use: a sign-in link that runs
 * script or leaves the site, a dispatcher choosing where payouts land or how
 * calls route, alerts posted anywhere and kept after removal, and a password
 * on someone else's address picking up access granted to them later.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test, { after } from "node:test";

import { safeCallbackUrl } from "../src/lib/safe-callback.ts";
import { isBrowserPushEndpoint } from "../src/lib/web-push.ts";
import { createPasswordAccount, passwordSessionStillValid, setVerifiedPassword } from "../src/lib/password-auth.ts";
import { removeTeammate } from "../src/lib/team.ts";
import { prisma } from "../src/lib/prisma.ts";

const DOMAIN = "security-holes.invalid";
let n = 0;
const address = (label) => `${label}-${Date.now()}-${n++}@${DOMAIN}`;
const read = (path) => readFileSync(path, "utf8");

after(async () => {
  await prisma.passwordLogin.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.membership.deleteMany({ where: { email: { endsWith: DOMAIN } } });
  await prisma.business.deleteMany({ where: { ownerEmail: { endsWith: DOMAIN } } });
  await prisma.$disconnect();
});

test("sign-in only ever sends you to a page on this site", () => {
  assert.equal(safeCallbackUrl("/dashboard/onboarding"), "/dashboard/onboarding");
  assert.equal(safeCallbackUrl("/dashboard/jobs?x=1#top"), "/dashboard/jobs?x=1#top");
  for (const bad of [
    "javascript:alert(1)",
    "https://evil.example/login",
    "//evil.example",
    "/\\evil.example",
    "/\t/evil.example",
    " javascript:alert(1)",
    "data:text/html,hi",
    "",
    undefined,
  ]) {
    assert.equal(safeCallbackUrl(bad), "/dashboard", String(bad));
  }
  for (const file of ["src/components/signin-panel.tsx", "src/components/signin-verify.tsx"]) {
    assert.match(read(file), /window\.location\.href = safeCallbackUrl\(callbackUrl\)/, file);
  }
  assert.match(read("src/app/signin/page.tsx"), /safeCallbackUrl\(params\.callbackUrl\)/);
});

test("only the owner sets up payouts; only settings roles change call routing or the busy calendar", () => {
  const connect = read("src/app/api/connect/route.ts");
  assert.match(connect.slice(connect.indexOf("export async function POST")), /^[\s\S]{0,300}requirePermission\("billing\.manage"/);
  assert.match(read("src/app/api/connect/refresh/route.ts"), /requirePermission\("billing\.manage"/);
  const connection = read("src/app/api/account/connection/route.ts");
  assert.match(connection.slice(connection.indexOf("export async function PATCH")), /^[\s\S]{0,200}requirePermission\("settings\.edit"\)/);
  const busy = read("src/app/api/account/busy-calendar/route.ts");
  assert.equal(busy.match(/requirePermission\("settings\.edit"\)/g)?.length, 2, "add and remove both need settings rights");
});

test("push alerts only go to real browser push services", () => {
  assert.equal(isBrowserPushEndpoint("https://fcm.googleapis.com/fcm/send/abc"), true);
  assert.equal(isBrowserPushEndpoint("https://web.push.apple.com/QGx"), true);
  assert.equal(isBrowserPushEndpoint("https://updates.push.services.mozilla.com/wpush/v2/x"), true);
  assert.equal(isBrowserPushEndpoint("https://wns2-by3p.notify.windows.com/w/?token=x"), true);
  for (const bad of ["http://fcm.googleapis.com/x", "https://attacker.example/x", "http://10.0.0.1/x", "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com:8443/x", "nope"]) {
    assert.equal(isBrowserPushEndpoint(bad), false, bad);
  }
});

test("removing a teammate ends their alerts, and a manager's removal rotates the calendar link", async () => {
  const owner = address("owner");
  const shop = await prisma.business.create({ data: { name: "Hole Test", slug: `hole-${Date.now()}`, ownerEmail: owner } });
  const manager = address("manager");
  const member = await prisma.membership.create({ data: { businessId: shop.id, email: manager, role: "manager" } });
  await prisma.pushSubscription.create({ data: { businessId: shop.id, endpoint: `https://fcm.googleapis.com/fcm/send/${Date.now()}-m`, p256dh: "p".repeat(20), auth: "a".repeat(10), email: manager } });
  await prisma.pushSubscription.create({ data: { businessId: shop.id, endpoint: `https://fcm.googleapis.com/fcm/send/${Date.now()}-o`, p256dh: "p".repeat(20), auth: "a".repeat(10), email: owner } });
  const before = (await prisma.business.findUnique({ where: { id: shop.id } })).calendarFeedVersion;

  const result = await removeTeammate({ businessId: shop.id, membershipId: member.id, by: owner, byOwner: true, canManage: true });
  assert.equal(result.ok, true);
  const left = await prisma.pushSubscription.findMany({ where: { businessId: shop.id } });
  assert.deepEqual(left.map((s) => s.email), [owner], "only the removed person's devices go");
  assert.equal((await prisma.business.findUnique({ where: { id: shop.id } })).calendarFeedVersion, before + 1);
  assert.match(read("src/app/api/account/route.ts"), /calendarFeedUrl: businessRecord && role && can\(role, "settings\.edit"\)/);
});

test("a password on someone else's address loses its session once that address is invited or proven", async () => {
  const victim = address("newhire");
  assert.equal((await createPasswordAccount(victim, "correct horse battery", { publicSignupReady: true })).ok, true);
  assert.equal(await passwordSessionStillValid(victim), true, "a fresh signup with nothing attached is fine");

  const shop = await prisma.business.create({ data: { name: "Invite Test", slug: `inv-${Date.now()}`, ownerEmail: address("boss") } });
  await new Promise((r) => setTimeout(r, 5));
  await prisma.membership.create({ data: { businessId: shop.id, email: victim, role: "dispatcher" } });
  assert.equal(await passwordSessionStillValid(victim), false, "the invite does not reach the unproven password session");

  await prisma.passwordLogin.deleteMany({ where: { email: victim } });
  assert.equal(await passwordSessionStillValid(victim), false, "once the real owner proves the address, the old session is gone");

  const owner = address("ownself");
  await createPasswordAccount(owner, "correct horse battery", { publicSignupReady: true });
  await new Promise((r) => setTimeout(r, 5));
  await prisma.business.create({ data: { name: "Own Shop", slug: `own-${Date.now()}`, ownerEmail: owner } });
  assert.equal(await passwordSessionStillValid(owner), true, "a shop you create yourself after signup stays yours");

  const proven = address("proven");
  await setVerifiedPassword(proven, "correct horse battery");
  await prisma.membership.create({ data: { businessId: shop.id, email: proven, role: "manager" } });
  assert.equal(await passwordSessionStillValid(proven), true);

  const auth = read("src/auth.ts");
  assert.match(auth, /token\.viaPassword = account\.provider === "password"/);
  assert.match(auth, /passwordSessionStillValid\(token\.email\)\)\) return null/);
});

test("dispatchers don't see the shop's money on the locations page", () => {
  assert.match(read("src/lib/portfolio.ts"), /collectedCents: can\(role, "reports\.view"\)/);
});
