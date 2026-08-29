# Google Sign-In setup

Orvius uses **Google OAuth** for dashboard access.

## 1. Create Google OAuth credentials

1. Open [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials)
2. Create project (or select existing)
3. **OAuth consent screen** → External → add your email as test user
4. **Create credentials** → OAuth client ID → **Web application**
5. Authorized redirect URIs:

```
http://localhost:3000/api/auth/callback/google
https://YOUR-DOMAIN/api/auth/callback/google
```

## 2. Add to `.env`

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
Homepage → Sign in with Google → /dashboard
```

Protected routes: `/dashboard/*`, `/admin/*`

Unauthenticated users are redirected to `/login`.
