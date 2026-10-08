# Railway Deploy Notes

This repo is prepared for a two-service Railway setup, but nothing is activated by default.

## Services to create

### 1. Backend web service

- Root directory: `backend`
- Start command: `bash railway/run-web.sh`
- Public domain: yes

Purpose:

- Django API for CookOps
- normal interactive web traffic

### 2. Drive sync cron service

- Root directory: `backend`
- Start command: `bash railway/run-drive-sync-cron.sh`
- Public domain: no
- Cron schedule: set in Railway UI when you are ready

Suggested schedules:

- every 15 minutes: `*/15 * * * *`
- every 30 minutes: `*/30 * * * *`

Important:

- Railway cron jobs use UTC
- the cron service should execute the command and exit
- do not enable the in-process worker in Railway production

## Required environment variables

Both services should share the same variables:

- `DJANGO_SECRET_KEY`
- `DJANGO_DEBUG=false`
- `DJANGO_ALLOWED_HOSTS`
- `POSTGRES_DB`
- `POSTGRES_USER`
- `POSTGRES_PASSWORD`
- `POSTGRES_HOST`
- `POSTGRES_PORT`
- `COOKOPS_API_KEYS`
- `COOKOPS_SESSION_TTL_SECONDS=28800`
- `COOKOPS_LEGACY_LOGIN_ENABLED=true`
- `COOKOPS_REGISTRATION_ENABLED=true` to expose invited workspace creation
- `COOKOPS_REGISTRATION_INVITE_CODE` with a long private pilot code
- `DEFAULT_ORGANIZATION_ID=00000000-0000-4000-8000-000000000001`
- `DEFAULT_ORGANIZATION_SLUG=chefside-france`
- `DEFAULT_ORGANIZATION_NAME=ChefSide France`
- `GOOGLE_DRIVE_FOLDER_ID`
- `GOOGLE_DRIVE_OAUTH_CLIENT_ID`
- `GOOGLE_DRIVE_OAUTH_CLIENT_SECRET`
- `GOOGLE_DRIVE_OAUTH_REFRESH_TOKEN`
- `GOOGLE_DRIVE_OAUTH_TOKEN_URI`
- `GOOGLE_DRIVE_TIMEOUT_SECONDS`

Recommended for Railway:

- `DRIVE_IMPORT_WORKER_ENABLED=false`

Optional:

- `GUNICORN_WORKERS=2`
- `GUNICORN_TIMEOUT=120`

## Activation flow

When you are ready to deploy:

1. Create the backend service from this repo with root `backend`
2. Set the start command to `bash railway/run-web.sh`
3. Add the required environment variables
4. Deploy the backend service
5. Create a second service from the same repo with root `backend`
6. Set the start command to `bash railway/run-drive-sync-cron.sh`
7. Set a cron schedule in Railway UI
8. Reuse the same database and Google Drive variables

Before the first tenancy deployment, create and verify a PostgreSQL backup. The web start command runs migrations automatically and assigns every existing site and supplier to `ChefSide France`; it does not delete or duplicate operational data.

Deploy the backend before the frontend in the same maintenance session. During the short interval, existing integrations continue to authenticate with `X-API-Key`; the new frontend exchanges the same server-side credential for a signed browser session.

## Why this layout

- the web service stays stateless
- Drive polling stays outside the web process
- cron execution is controlled by Railway instead of a Python thread
