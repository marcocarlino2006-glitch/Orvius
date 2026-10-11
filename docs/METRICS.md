# Company metrics: definitions and limits

Source: `src/lib/company-scoreboard.ts` (shown on `/admin` and in the Monday founder email).
Every metric counts **real shops only** (`Business.environment = "production"`). Demo, test and preview workspaces never count.

| Metric | Definition | Denominator | Source | Limitations |
|---|---|---|---|---|
| Paying shops | Active production shops with `billingStatus` active or past_due | — | `Business` | Past due counts as paying until Stripe cancels. Stripe trials map to active. |
| Activation, 30 days | Of shops created in the last 30 days: how many had a call answered on their Orvius line (`lineVerifiedAt`), and how many proved calls to their own number reach Orvius (`overflowProvedAt`, set only by a real forwarded or test call) | Shops created in last 30 days | `Business` | The line answering can be the owner's own test call. It does not prove customer demand. |
| Signup to first job from an answered call or text | Median minutes from shop creation to its first job whose lead came from a call (`Lead.callId`) or text (`Lead.source = "sms"`) | Shops from the last 30 days with such a job (newest 1,000) | `Business`, `Job`, `Lead` | Owner-entered jobs are excluded on purpose. A job is not a completed or paid job. |
| Calls / finished cleanly | Calls created in the window; failed = status failed or still in progress after 1 hour | Calls in window | `Call` | Clean means the call finished, not that the caller was helped. |
| Booking rate | Leads that became a job | Leads in window | `Lead`, `Job` | Includes jobs the owner created from a lead. |
| Jobs booked / from calls and texts Orvius answered | All jobs created; the subset whose lead came from a call or text | — | `Job`, `Lead` | Booked is a scheduled time, not a confirmed or completed visit. |
| Customer confirmed | Jobs whose customer tapped confirm in the window (`customerConfirmedAt`) | — | `Job` | The office marking a job confirmed is deliberately not counted. |
| Completed | Jobs marked completed in the window (`completedAt`) | — | `Job` | Marked by the shop or technician; Orvius does not verify the work. |
| Shops' customer payments | Payments recorded or collected on shop invoices in the window | — | `Payment` | **The shops' money, not Orvius revenue.** Includes cash and checks the shop recorded by hand. Refunds are excluded. |
| Orvius platform fees | `applicationFeeCents` on invoices and deposits paid by card in the window | — | `Invoice`, `Deposit` | Only card payments through Stripe Connect carry a fee. |
| MRR | Sum of list price per month for each paying shop's plan (annual ÷ 12) | — | `Business.billingPlan/Interval` | List price, not cash collected. Excludes overage, discounts and refunds. |
| Unit cost / gross margin | Vapi-reported cost per call, plus estimated phone minutes, texts and model use, plus fixed costs per plan | MRR | `Call.costMicros`, `call-cost.ts` | Phone and text costs are estimates, not Twilio bills. Infrastructure, support, refunds and manual intervention are not included yet. |
| Retention since first payment | Of shops whose subscription first went active (not trialing) at least 30 / 90 days ago, how many are still active or past due | Shops that reached that age | `Business.paidSince`, `billingStatus` | `paidSince` is recorded from Oct 2026 on; shops that paid earlier have no start date. Windows nobody has reached yet are hidden, not shown as 0%. |
| Canceled / cancel reasons | Shops whose plan ended this week; reasons owners gave Stripe in the last 30 days | — | `Business.canceledAt`, `cancelReason` | Counts, not a churn rate. |
| New shops by source | Channel from the signup's first-touch link (UTM, referral, host) | Newest 1,000 shops in 30 days | `Business.acquisitionJson` | No ad spend is recorded, so there is no customer acquisition cost or payback yet. |

Not measured yet, and what it would take:
- **Customer acquisition cost and payback:** needs spend per channel entered by the founder; the source split above is the other half.
- **Full contribution profit:** needs real Twilio usage cost, infrastructure, support time and refunds per month.
- **Manual intervention rate:** owner edits to what Orvius captured are logged per shop (`operating-metrics.ts`), but not rolled up company-wide.
