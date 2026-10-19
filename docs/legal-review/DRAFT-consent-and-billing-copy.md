# DRAFT for legal review. Not published, not approved, not legal advice.

Nothing below is live. Each item quotes the words the product says or shows today, then gives a proposed draft and the questions counsel should answer. Wording in the product changes only after review.

## 1. Call recording and automated answering notice

In product today (`openingWithNotice` in `src/lib/vapi.ts`):

> This call may be recorded and is answered by an automated receptionist for {shop}.

Proposed draft:

> This call is recorded and answered by an automated assistant for {shop}. Stay on the line to continue.

Questions for counsel:
- Two-party consent states: is "may be recorded" enough, or must the notice say "is recorded" and ask the caller to continue?
- Must the notice come before any caller speech is captured? Today it is part of the first sentence spoken.
- The owner's approval of this text is stored with its version (`ActivationAcknowledgement`). Is that record enough evidence?

## 2. Passing a caller to another local company

In product today (`NETWORK_OFFER_REPLY`, version `network-offer-v1`):

> We're booked up. I can share your name, number and what you need with another local company we work with, so they can call you sooner. Is that okay?

What is shared on a yes: name, callback number, what they need. Address, email and notes are not shared. The caller's own words after the question are kept as evidence.

Questions for counsel:
- Does "another local company we work with" sufficiently identify the recipient, or must the company be named?
- Is a spoken yes on a recorded line valid consent for this sharing in each launch state?
- Retention period for the consent evidence.

## 3. A second payment on a bill that was already settled

In product today, the owner is told:

> Orvius: a customer paid the {invoice|deposit} again after it was settled (${amount}). Nothing was refunded automatically. Refund it in Stripe or tell the customer it's credited, then mark it resolved.

Proposed customer-facing line, not live, for the shop to send:

> We received a second payment of ${amount} for a bill that was already paid. We'll refund it or apply it to your next visit, whichever you prefer. Reply to let us know.

Questions for counsel:
- Is there a deadline by which an unrequested extra payment must be refunded or the customer told (card network rules, state law)?
- May a shop hold it as a credit without the customer's written agreement?

## 4. Changing a bill the customer already has

In product today, a bill that was sent, signed or paid toward keeps its amount. Changing it needs an owner or manager and a written reason, which goes into the shop's activity log.

Questions for counsel:
- Must the customer be told the reason in writing before the new amount can be charged?
- Do estimate-signature rules in any launch state limit how far a final bill can exceed a signed estimate?

## 5. Annual plans

In product today (`/pricing`, annual view):

> Annual prices are shown per month and charged once a year. Annual prepays the plan only: the included calls are still per month, and calls past them are 50¢ each, invoiced monthly, the same as on monthly billing.

Questions for counsel:
- Is this disclosure enough for automatic-renewal laws (for example, California), or is a separate renewal notice needed before each annual charge?
- Refund terms for annual plans after the money-back window.
