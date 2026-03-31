# ITIN Assistance Service

Professional ITIN application assistance website built with Express, EJS, and vanilla JavaScript.

## Features

- Trust-focused landing page with clear private-service disclosures
- Multi-step ITIN intake with local + server draft saving
- Internal tracking page for applicants
- Basic admin login and dashboard
- W-7 preparation summary PDF generation
- SMTP-backed confirmation email flow with file-log fallback

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

For production, set `BASE_URL=https://etaxids.com` in your `.env`.

## Admin login

Defaults are controlled by `.env`. Change them before deployment.

- Email: `ADMIN_EMAIL`
- Password: `ADMIN_PASSWORD`

## Notes

- This is a private assistance website and not affiliated with the IRS.
- The app stores submissions in local JSON files inside `data/`. Swap the storage layer in `lib/storage.js` for a database when needed.
- Confirmation emails send through SMTP when configured. Without SMTP settings, emails are logged to `data/email-log.json`.

## Render deployment

This repo now includes `render.yaml` for Render Blueprint deployment.

What it configures:

- Node web service
- Starter plan
- Persistent disk mounted at `/var/data`
- `DATA_DIR=/var/data` so application data survives restarts and deploys
- Health check at `/healthz`
- Custom domain `etaxids.com`
- Required env vars and prompts for secrets like admin login and SMTP

Deploy steps:

1. Push this project to GitHub.
2. In Render, create a new Blueprint and point it at this repo.
3. When prompted, fill in:
   - `ADMIN_EMAIL`
   - `ADMIN_PASSWORD`
   - `SMTP_PASS`
4. Let Render create the web service and disk.
5. In your DNS provider, point `etaxids.com` to Render using the DNS records Render shows for your service.

Important:

- A persistent disk requires a paid web service tier, which is why the Blueprint uses `starter`.
- Without SMTP credentials, contact-form and application emails will log to disk instead of sending.

### Google Workspace SMTP

`etaxids.com` is currently using Google Workspace MX records, so the SMTP settings for Render should be:

- `SMTP_HOST=smtp.gmail.com`
- `SMTP_PORT=587`
- `SMTP_USER=contact@etaxids.com`
- `SMTP_PASS=` your Google app password
- `SMTP_FROM=ETAX IDS ITIN Assistance Service <contact@etaxids.com>`

Setup steps:

1. Turn on 2-Step Verification for `contact@etaxids.com`.
2. Create a Google app password for Mail.
3. Paste that 16-character app password into Render as `SMTP_PASS`.
