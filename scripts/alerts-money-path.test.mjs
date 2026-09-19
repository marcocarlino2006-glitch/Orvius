import assert from "node:assert/strict";
import test from "node:test";

import { ownerAlertsAreMuted } from "../src/lib/owner-alerts-muted.ts";
import { depositMoneyPathBroken } from "../src/lib/deposit-money-path.ts";
import {
  ATTENTION_KINDS,
  attentionActionStrategy,
  attentionKindLabel,
} from "../src/lib/attention-types.ts";

test("owner SMS opt-out mutes alerts", () => {
  assert.equal(ownerAlertsAreMuted({ ownerSmsOptOutAt: new Date() }), true);
  assert.equal(ownerAlertsAreMuted({ ownerSmsOptOutAt: null }), false);
});

test("deposits on without Connect charges is a broken money path", () => {
  assert.equal(
    depositMoneyPathBroken({
      depositEnabled: true,
      stripeConnectAccountId: null,
      stripeConnectChargesEnabled: false,
    }),
    true,
  );
  assert.equal(
    depositMoneyPathBroken({
      depositEnabled: true,
      stripeConnectAccountId: "acct_x",
      stripeConnectChargesEnabled: true,
      stripeConnectPayoutsEnabled: true,
      stripeConnectDetailsSubmitted: true,
    }),
    false,
  );
  assert.equal(
    depositMoneyPathBroken({
      depositEnabled: false,
      stripeConnectAccountId: null,
    }),
    false,
  );
});

test("alerts_muted and money_path_broken are board kinds", () => {
  assert.ok(ATTENTION_KINDS.includes("alerts_muted"));
  assert.ok(ATTENTION_KINDS.includes("money_path_broken"));
  assert.equal(attentionKindLabel("alerts_muted"), "Alerts off");
  assert.equal(attentionKindLabel("money_path_broken"), "Money path");
  assert.equal(attentionActionStrategy("alerts_muted"), "open");
  assert.equal(attentionActionStrategy("money_path_broken"), "open");
});

test("board deep-links land on Settings owner-alerts and Billing payouts", async () => {
  const { readFileSync } = await import("node:fs");
  const { fileURLToPath } = await import("node:url");
  const { dirname, join } = await import("node:path");
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  const queue = readFileSync(join(root, "src/lib/attention-queue.ts"), "utf8");
  assert.match(queue, /settings#owner-alerts/);
  assert.match(queue, /billing#payouts/);
  assert.match(queue, /settings#overflow-forward/);
  assert.doesNotMatch(queue, /settings#payouts/);
});
