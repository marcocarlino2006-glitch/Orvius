import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");

test("the claim turns a shop name into a shareable front-door preview link", () => {
  const claim = read("src/components/claim-front-door.tsx");
  assert.match(claim, /Claim your front door/);
  assert.match(claim, /`\/try\?shop=\$\{encodeURIComponent\(shop\)\}&trade=\$\{encodeURIComponent\(trade\)\}&utm_source=claim&utm_medium=front-door`/);
  assert.match(claim, /href=\{SIGNUP_HREF\}/, "making it live lands in the same setup flow as every start button");
  assert.match(claim, /saves nothing on our side/, "the claim is honest that nothing is stored or bought yet");
  assert.match(claim, /Copy your link/);
});

test("a claimed link opens the preview with the shop already filled in", () => {
  const page = read("src/app/try/page.tsx");
  assert.match(page, /searchParams: Promise<\{ shop\?: string; trade\?: string \}>/);
  assert.match(page, /initial=\{\{ name: shop \|\| undefined, trade \}\}/);
  assert.match(page, /<ShopPreviewForm initial=/);
  const form = read("src/components/shop-preview-form.tsx");
  assert.match(form, /initial\?: \{ name\?: string; trade\?: string \}/);
});

test("every replay can be shared onward and lands on the hear-your-shop preview", () => {
  const player = read("src/components/call-replay-player.tsx");
  assert.match(player, /Share this call/);
  assert.match(player, /navigator\.clipboard/);
  assert.match(player, /utm_source=replay/);
});

test("the claim is on the launch page and the homepage, not buried", () => {
  const launch = read("src/app/launch/page.tsx");
  assert.match(launch, /id="claim"/);
  assert.match(launch, /<ClaimFrontDoor \/>/);
  assert.match(launch, /Claim your front door\./);
  assert.match(launch, /I built this\. Call it\./);
  assert.match(read("src/components/home-line-hero.tsx"), /I built this\./);
  assert.match(read("src/components/home-line-hero.tsx"), /The night shift for shops that run on the phone\./);
  const home = read("src/app/page.tsx");
  assert.match(home, /<ClaimFrontDoor compact \/>/);
  assert.match(home, /Claim your front door\./);
});
