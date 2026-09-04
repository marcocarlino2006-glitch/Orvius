#!/usr/bin/env node
/**
 * Mirrors src/lib/billing-entitlement.ts + pay-prompt + expired plan gate.
 * Self-contained like other trust tests (no @/ path resolution).
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

const PILOT_DAYS = 30;
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

function resolvePilotEndsAt(business) {
  if (business.pilotEndsAt) {
    const d = new Date(business.pilotEndsAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (business.createdAt) {
    const d = new Date(business.createdAt);
    if (Number.isNaN(d.getTime())) return null;
    d.setDate(d.getDate() + PILOT_DAYS);
    return d;
  }
  return null;
}

function isPilotExpired(business, now = new Date()) {
  const ends = resolvePilotEndsAt(business);
  if (!ends) return false;
  return now.getTime() > ends.getTime();
}

function isBillingEntitled(business, now = new Date()) {
  const status = (business.billingStatus ?? "none").toLowerCase();
  if (status === "active" || status === "past_due") return true;
  if (status === "canceled") return false;
  if (isPilotExpired(business, now)) return false;
  return true;
}

function getEffectivePlanId(params) {
  if (!isBillingEntitled(params)) return "expired";
  const { billingStatus, billingPlan } = params;
  if (billingStatus === "pilot" || billingStatus === "none" || !billingStatus) {
    return "pilot";
  }
  if (billingStatus === "active" && ["line", "pro", "fleet"].includes(billingPlan)) {
    return billingPlan;
  }
  if (billingStatus === "past_due" && ["line", "pro", "fleet"].includes(billingPlan)) {
    return billingPlan;
  }
  return "pilot";
}

function canAccessModule(plan, module) {
  if (plan === "expired") return false;
  if (plan === "line") return ["today", "inbox", "calls"].includes(module);
  return true;
}

function getPayPromptDecision(params) {
  const status = (params.billingStatus ?? "none").toLowerCase();
  const fields = {
    billingStatus: params.billingStatus,
    billingPlan: params.billingPlan,
    pilotEndsAt: params.pilotEndsAt,
    createdAt: params.shopCreatedAt ?? params.createdAt,
  };

  if (status === "active") return null;

  if (status === "past_due") {
    return {
      show: true,
      tone: "past_due",
      hard: true,
      snoozeMs: 0,
    };
  }

  if (!isBillingEntitled(fields)) {
    return {
      show: true,
      tone: "locked",
      hard: true,
      snoozeMs: 15 * MINUTE,
    };
  }

  const ends = resolvePilotEndsAt(fields);
  const daysLeft =
    ends != null
      ? Math.max(0, Math.ceil((ends.getTime() - Date.now()) / (24 * HOUR)))
      : null;
  const endingSoon = daysLeft != null && daysLeft <= 7;

  return {
    show: true,
    tone: endingSoon || status === "none" ? "required" : "trial",
    hard: false,
    snoozeMs: endingSoon || status === "none" ? 2 * HOUR : 4 * HOUR,
  };
}

describe("billing entitlement", () => {
  it("active is entitled", () => {
    assert.equal(
      isBillingEntitled({ billingStatus: "active", billingPlan: "pro" }),
      true,
    );
  });

  it("expired pilot is not entitled", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() - 1);
    assert.equal(
      isBillingEntitled({
        billingStatus: "pilot",
        pilotEndsAt: ends.toISOString(),
      }),
      false,
    );
    assert.equal(
      isPilotExpired({ billingStatus: "pilot", pilotEndsAt: ends }),
      true,
    );
  });

  it("expired plan has no modules", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() - 1);
    const plan = getEffectivePlanId({
      billingStatus: "pilot",
      pilotEndsAt: ends,
    });
    assert.equal(plan, "expired");
    assert.equal(canAccessModule(plan, "inbox"), false);
  });
});

describe("pay prompt loop", () => {
  it("hides for active subscribers", () => {
    const d = getPayPromptDecision({ billingStatus: "active", billingPlan: "pro" });
    assert.equal(d, null);
  });

  it("asks mid-trial pilots softly", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() + 20);
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      pilotEndsAt: ends.toISOString(),
      shopCreatedAt: new Date().toISOString(),
    });
    assert.ok(d);
    assert.equal(d.show, true);
    assert.equal(d.hard, false);
    assert.ok(d.snoozeMs <= 4 * HOUR);
  });

  it("locks when pilot ended", () => {
    const ends = new Date();
    ends.setDate(ends.getDate() - 2);
    const d = getPayPromptDecision({
      billingStatus: "pilot",
      pilotEndsAt: ends.toISOString(),
    });
    assert.ok(d);
    assert.equal(d.tone, "locked");
    assert.equal(d.hard, true);
  });

  it("urgent lock for past_due", () => {
    const d = getPayPromptDecision({ billingStatus: "past_due", billingPlan: "pro" });
    assert.ok(d);
    assert.equal(d.tone, "past_due");
    assert.equal(d.hard, true);
    assert.equal(d.snoozeMs, 0);
  });
});
