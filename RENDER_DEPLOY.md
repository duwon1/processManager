# Render Deployment

## Service

- Type: Web Service
- Runtime: Docker
- Plan: Free
- Region: Singapore
- Branch: `master`
- Health Check Path: `/health`
- Expected URL: `https://processmanager-web.onrender.com`

Render may change the subdomain if the service name is unavailable. In that case, replace every URL below with the actual Render URL.

## Environment Variables

Set these in Render when creating the service.

```properties
APP_REFRESH_TOKEN_STORE=database
```

Copy these values from `backend/.env`:

```properties
DB_PASSWORD=
JWT_SECRET=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_MAIL_CLIENT_ID=
GOOGLE_MAIL_CLIENT_SECRET=
GOOGLE_MAIL_REFRESH_TOKEN=
GOOGLE_MAIL_FROM=
```

Optional explicit URL values. If omitted, the app uses Render's `RENDER_EXTERNAL_URL`.

```properties
APP_PUBLIC_URL=https://processmanager-web.onrender.com
APP_CORS_ALLOWED_ORIGINS=https://processmanager-web.onrender.com
APP_OAUTH2_REDIRECT_URI=https://processmanager-web.onrender.com/oauth2/redirect
APP_OAUTH2_LOGIN_REDIRECT_URI=https://processmanager-web.onrender.com/login/oauth2/code/google
```

## Google OAuth

Add this authorized redirect URI in Google Cloud Console:

```text
https://processmanager-web.onrender.com/login/oauth2/code/google
```

If Render gives a different URL, use that URL instead.

## Sleep Prevention

Use an uptime monitor and ping this URL every 10 minutes:

```text
https://processmanager-web.onrender.com/health
```

The endpoint returns:

```json
{"status":"ok"}
```
