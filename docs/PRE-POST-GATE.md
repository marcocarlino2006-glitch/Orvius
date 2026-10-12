# Pre-post gate

The launch posts, assets, banned phrases and the publish checklist live in
`docs/LAUNCH.md`. Post only when its publish gate is complete.

The local checks (`npm run pre-post:check`, `npm run bulletproof`) test the
machine they run on and need live Twilio and Vapi keys there. Production is
checked with:

```bash
PROD_URL=https://orvius.im npm run -s prod:verify
```
