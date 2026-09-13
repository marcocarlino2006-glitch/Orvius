# Google Sign-In setup

Orvius uses **Google OAuth** for dashboard access.

## 1. Create Google OAuth credentials

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create project (or select existing)
3. **OAuth consent screen** → External → add your email as test user
4. **Create credentials** → OAuth client ID → **Web application**
5. **Authorized JavaScript origins:**

```
http://localhost:3000
https://orvius.im
https://app.orvius.im
https://api.orvius.im
```

6. **Authorized redirect URIs** (Auth.js path — note `callback/google`, not `google/callback`):

```
http://localhost:3000/api/auth/callback/google
https://orvius.im/api/auth/callback/google
https://app.orvius.im/api/auth/callback/google
https://api.orvius.im/api/auth/callback/google
```

Remove legacy Manus URLs and any `/api/auth/google/callback` entries — they will not work with Orvius.

## 1b. Vercel preview deployments

Google refuses any `redirect_uri` that is not listed above, and a Vercel preview
URL carries a per-deployment hash:

```
https://orvius-m1eyw73fo-marcocarlino2006-glitch.vercel.app
```

`trustHost: true` means Auth.js builds the callback from the incoming request
host, so on a preview it sends that hash host as the `redirect_uri` and Google
answers `Error 400: redirect_uri_mismatch`. The host changes on every push, so
pasting each one into the console does not hold.

Point previews at the one production callback instead. Set this in Vercel for
**both** Production and Preview:

```bash
AUTH_REDIRECT_PROXY_URL=https://orvius.im/api/auth
```

Auth.js reads it with no code change, sends `https://orvius.im/api/auth/callback/google`
as the `redirect_uri` for every deployment, and production forwards the session
back to whichever preview started the sign-in. Production needs the variable too
— that is how it recognises itself as the proxy rather than treating the value as
a foreign redirect.

Two things to keep in mind:

- Every deployment must share one `AUTH_SECRET`, or production cannot sign a
  session the preview will accept.
- The proxy hop only works while the production deployment is healthy, since it
  is the host Google actually returns to.

The email sign-in link on `/signin` does not depend on any of this. It never
leaves the deployment's own origin, so it works on a preview URL as-is provided
`RESEND_API_KEY` is set for that environment.

## 2. Add to `.env` and Vercel

```bash
AUTH_SECRET=   # openssl rand -base64 32
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
```

Optional — restrict who can sign in:

```bash
ORVIUS_AUTH_ALLOWED_EMAILS=marco@gmail.com,hello@orvius.im
```

Leave empty to allow any Google account (pilot mode).

## 3. Flow

```
Homepage → /signin → Google (or an emailed sign-in link) → /dashboard
```

Protected routes: `/dashboard/*`, `/admin/*`

Unauthenticated users are redirected to `/signin`, carrying a `callbackUrl` so
they land where they were headed. `/login` permanently redirects to `/signin`.
