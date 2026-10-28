#!/usr/bin/env node
/*
 * The admin screen once drew every shop in the database on one page: with a
 * few thousand shops it was half a million pixels tall and the launch card
 * was buried under it. The list is searched and paged on the server, and the
 * screen is four sections, not one scroll.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PrismaClient } from "@prisma/client";

process.env.ORVIUS_ADMIN_KEY = "local-admin-key-for-tests";
const prisma = new PrismaClient();
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const tag = `adm${Date.now().toString(36)}`;
const ids = [];

test.after(async () => {
  await prisma.business.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
});

const ask = async (query) => {
  const { NextRequest } = await import("next/server");
  const { GET } = await import("../src/app/api/businesses/route.ts");
  return GET(
    new NextRequest(`http://localhost/api/businesses${query}`, {
      headers: { "x-orvius-admin-key": process.env.ORVIUS_ADMIN_KEY },
    }),
  );
};

test("the shop list is paged, searchable, and says how many there are", async () => {
  for (let i = 0; i < 4; i += 1) {
    const row = await prisma.business.create({ data: { name: `Paged ${tag} ${i}`, slug: `${tag}-${i}`, ownerPhone: "+15125550100" } });
    ids.push(row.id);
  }
  const page = await ask(`?q=${tag}&limit=3`);
  assert.equal(page.status, 200);
  const rows = await page.json();
  assert.equal(rows.length, 3, "a page is as long as it was asked to be");
  assert.equal(page.headers.get("x-total-count"), "4", "the total is not the page");
  const none = await ask(`?q=${tag}-nothing-like-this`);
  assert.deepEqual(await none.json(), []);
  assert.equal(none.headers.get("x-total-count"), "0");
  const huge = await ask("?limit=99999");
  assert.ok((await huge.json()).length <= 200, "the page size has a ceiling");
});

test("the shop list sends the columns the screen shows, not the whole record", async () => {
  const [row] = await (await ask(`?q=${tag}&limit=1`)).json();
  assert.ok(row.name && row.slug && row._count);
  for (const heavy of ["systemPrompt", "hoursJson", "servicesJson", "stripeCustomerId"]) {
    assert.ok(!(heavy in row), `${heavy} stays out of the list`);
  }
});

test("the admin screen is sections with a searchable, paged shop list", () => {
  const page = read("src/app/admin/page.tsx");
  for (const id of ["overview", "launch", "shops", "growth"]) assert.match(page, new RegExp(`id: "${id}"`));
  assert.match(page, /x-total-count/);
  assert.match(page, /Show more/);
  assert.match(page, /type="search"/);
  assert.doesNotMatch(page, /fetch\("\/api\/businesses"\)/, "no unbounded fetch of every shop");
});
