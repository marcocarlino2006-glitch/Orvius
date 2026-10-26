# Toll-free verification for the Orvius SMS number

Until the number is verified, US carriers can filter or block every text it sends. That covers owner lead alerts, appointment confirmations, payment links and follow-ups. Verification is free and usually takes a few business days.

Submit it in **Twilio Console → Messaging → Regulatory Compliance → Toll-Free Verifications → Create**, choosing the number in `TWILIO_PHONE_NUMBER`. Every field is below. The fields marked **(owner)** are facts only the owner has.

The founder launch card at `/admin` shows the live status once it's submitted.

| Field | Value |
| --- | --- |
| Business name | Solution Development LLC |
| Brand / DBA | Orvius |
| Business type | Private profit (LLC) |
| Business registration number (EIN) | **(owner)** |
| Business address | **(owner)** — must match the EIN record |
| Website | https://orvius.im |
| Contact name / email / phone | **(owner)** / support@orvius.im / **(owner)** |
| Use case categories | Account Notifications, Customer Care |
| Estimated monthly volume | 1,000 (the lowest band; raise it as shops grow) |
| Opt-in type | Verbal (customers) and Web form (owners) |
| Opt-in image / URL | https://orvius.im/sms-terms (plus a screenshot of the owner-alerts setup step in onboarding) |
| Privacy policy | https://orvius.im/privacy |
| Terms | https://orvius.im/terms |

## Use case summary

> Orvius sends transactional texts only, never marketing, for HVAC, plumbing and electrical shops. Account notifications: the owner enters a mobile number during setup and is texted when a caller requests service. Customer care: the customer calls or texts the shop first and gives a number for that job. Messages cover that job only: received, a proposed time and confirm link, one reminder, one follow-up, and a pay link. Each customer text names the shop and says Reply STOP to opt out.

Twilio's form rejects this field above 500 characters. The sentence above is the one the admin button files.

## How opt-in works

> Owners: during onboarding the owner enters their mobile number and turns on lead alerts. The SMS terms (orvius.im/sms-terms) are linked there.
>
> Customers: the customer contacts the business first, by phone or text, to request service and gives their mobile number so the business can reach them about that request. No list is imported or purchased, and no one is texted who did not contact the business.

## Sample messages

These follow the templates in the code that sends them; the names, times and links are examples.

1. Owner alert (`src/lib/owner-alert-message.ts`):
   > Same day · AC not cooling
   > Ann Lee
   > 12 Oak St, Austin TX
   > +15125550101
   > Proposed window · Thu, Oct 1, 2:00 PM CDT (awaiting customer confirm)

2. Appointment confirmation (`src/lib/customer-confirm.ts`):
   > Cole Heating: we have you down for service
   > Proposed window: Thu Oct 1, 2–4 PM
   > Confirm here: https://app.orvius.im/c/…
   >
   > Reply STOP to opt out. Msg&data rates may apply.

3. Follow-up (`src/lib/lead-follow-up.ts`):
   > Hi Ann, it's Cole Heating following up on your call about AC not cooling. Still need a hand? Reply with a day and time that suits you and we'll get you on the schedule, or call us at +1 312 555 0199. Reply STOP to opt out.

4. Invoice link (`src/lib/invoice-pay.ts`):
   > Cole Heating: thanks for choosing us. Your balance is $285.00. Pay securely here: https://app.orvius.im/i/…
   >
   > Reply STOP to opt out. Msg&data rates may apply.

## If it is rejected

The launch card shows Twilio's rejection reason. The usual causes are:

- an address that doesn't match the EIN record
- an opt-in URL a reviewer can't open
- a sample message that doesn't match the stated use case

Fix the named field and resubmit. Don't change the number: a new toll-free number starts unverified.
