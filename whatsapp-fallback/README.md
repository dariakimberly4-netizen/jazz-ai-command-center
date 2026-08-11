# Jazz WhatsApp Fallback

This module adds a safe fallback for Kimmy's 9:00 AM Jazz report.

## Intended behavior

- 9:00 AM Asia/Manila: Jazz daily report is due.
- Jazz Command Center sends a private heartbeat while the app is open and visible.
- 9:15 AM Asia/Manila: the backend checks whether Jazz saw Kimmy online recently or whether she tapped **I'M HERE — NO WHATSAPP TODAY**.
- If neither happened, the backend sends an approved WhatsApp template message with the Jazz Command Center link.

The browser never stores the WhatsApp access token. The token belongs only in a private backend secret store.

## What is already in this repository

- `jazz-fallback.js` — phone-friendly controls inside Jazz Connections plus online heartbeat and acknowledgement.
- `worker.js` — Cloudflare Worker backend with `/status`, `/heartbeat`, `/ack`, and a scheduled WhatsApp fallback.
- `wrangler.toml` — the 9:15 AM Manila cron schedule and safe non-secret defaults.

## One-time setup

### 1. Meta WhatsApp Cloud API

Create or use a Meta business portfolio, WhatsApp Business Account, and business phone number. In WhatsApp Manager, create and approve a template named `jazz_daily_fallback` (or change the Worker variable to your chosen name).

Recommended template body:

`Good morning Kimmy. Jazz did not see you online for your 9 AM report. Your report is ready here: {{1}}`

The Worker sends the Jazz Command Center URL as `{{1}}`.

You will need these private values:

- WhatsApp access token
- WhatsApp Phone Number ID
- Kimmy's destination WhatsApp number in international format
- Graph API version currently enabled for the Meta app

Never commit the access token to GitHub.

### 2. Cloudflare Worker

Create a Worker named `jazz-whatsapp-fallback` and use `worker.js` as its code.

Create a Workers KV namespace and bind it to the Worker using the binding name:

`FALLBACK_KV`

Add these Worker variables/secrets in Cloudflare Settings:

Secrets:

- `WA_ACCESS_TOKEN`
- `WA_PHONE_NUMBER_ID`
- `WA_TO`

Variables:

- `WA_GRAPH_VERSION` — use the Graph API version shown by your Meta app
- `WA_TEMPLATE_NAME` = `jazz_daily_fallback`
- `WA_TEMPLATE_LANG` = `en_US`
- `JAZZ_URL` = `https://dariakimberly4-netizen.github.io/jazz-ai-command-center/`
- `ALLOWED_ORIGIN` = `https://dariakimberly4-netizen.github.io`

Add the cron trigger `15 1 * * *`. Cloudflare cron uses UTC, so 01:15 UTC is 09:15 in the Philippines.

### 3. Connect Jazz on the phone

Open Jazz Command Center > **CONNECTIONS** > **WhatsApp Fallback** > **SET UP**.

Paste the deployed Worker URL once. Jazz stores only this public Worker URL on the phone. It does not store the WhatsApp token.

When the status says **Connected**, the fallback is ready.

## Important limitation

This first version sends a WhatsApp reminder containing the Jazz link. It does not yet send the full generated daily report text. Sending the full report requires Jazz's real report-generation data/backend to be connected first.
