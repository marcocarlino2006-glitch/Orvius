# Institutional playbook

What we take from operators at scale — and how Orvius implements it **today**. Not vanity. Not claims we have not earned.

## The bar

Multi-billion-dollar service and software companies win on:

1. **Reliability you can bet a reputation on**
2. **Clarity for the person doing the work** (not the engineer)
3. **Honest contracts** — pricing, SLAs, and product match reality
4. **Onboarding that de-risks go-live** before money scales
5. **Measured accountability** — SLOs visible, failures logged, same-day fixes

Orvius is a wedge product for owner-operators. We adopt the **discipline**, not the headcount.

---

## What we borrow

| Operator | Practice | Orvius implementation |
|----------|----------|----------------------|
| **Stripe** | Idempotent money and events | Dedupe keys on calls, SMS, owner notifications; async outbox with retry |
| **Amazon** | Work backwards from customer outcome | Wedge sacred: call → qualify → alert → inbox → action |
| **Linear** | Respect user time; no jargon | Owner language in dashboard; clarity scan in CI |
| **ServiceTitan** | Vertical-first for trades | HVAC, plumbing, electrical — not generic CRM |
| **Datadog** | SLOs visible to stakeholders | P95 alert latency + shop health on Today |
| **Salesforce** | Implementation milestones | Go-live checklist (6 items) before design partner is "done" |

Code reference: `src/lib/institutional-standards.ts`

---

## Owner SLAs (measured, not promised in prose)

| Commitment | Target | Where measured |
|------------|--------|----------------|
| Owner alert speed | P95 under 60 seconds | `ProAlertSpeedBadge`, shop health |
| Shop line | Dedicated number, verified test call | Wedge readiness, shop health |
| Alert delivery | No stuck queue, failures surfaced | `OwnerNotification` queue, Today banner |
| Tenant isolation | Shop A never sees Shop B | API 401 without session; standard check |
| Support | Reply within 1 business day | hello@orvius.im (honest until we staff 24/7) |

Owners see this on **Today** and **Settings** via "Your service level."

---

## Operating cadence (how we run)

### Daily (founder / ops)

- Check design partner shop health in dashboard
- Clear stuck notification queue (`/api/cron/notifications` or manual)
- Log any wedge miss in `docs/FAILURE-LOG.md`

### Before every deploy

```bash
npm run ops:check
```

### Before every design partner goes live

```bash
npm run wedge:ready
npm run billing:check   # when they convert to paid
```

### Before public marketing

```bash
npm run pre-post:check
```

---

## What we do NOT copy yet

- Multi-region / 99.99% uptime pages without multi-region infra
- Enterprise SSO, SOC2 badges without audit
- 24/7 phone support without staffing
- Vanity homepage metrics ("2B calls handled")

When we earn it, we add it. Until then, we measure and show owners their **shop's** performance.

---

## Definition of institutional ready (one shop)

- [ ] `npm run ops:check` passes
- [ ] `npm run wedge:ready` 6/6 for that shop
- [ ] Owner can articulate: "I get the lead on my phone before I finish the job"
- [ ] Failure log has no open **blocker** or **high** for that shop's path
- [ ] Billing configured OR shop is explicitly on free pilot

Then — and only then — scale story, ads, or outbound.
