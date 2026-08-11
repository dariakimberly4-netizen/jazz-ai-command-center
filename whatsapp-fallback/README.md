# Jazz WhatsApp Fallback

This module adds a safe fallback for Kimmy's 9:00 AM Jazz report.

## Intended behavior

- 9:00 AM Asia/Manila: Jazz daily report is due.
- Jazz Command Center sends a private heartbeat while the app is open and visible.
- 9:15 AM Asia/Manila: the backend checks whether Jazz saw Kimmy online recently or whether she tapped **I'M HERE — NO WHATSAPP TODAY**.
- If neither happened, the backend sends an approved WhatsApp template message containing the Jazz fallback report.

The browser never stores the WhatsApp access token. The token belongs only in a private backend secret store.

## What is already in this repository

- `jazz-fallback.js` — phone-friendly controls inside Jazz Connections plus online heartbeat and acknowledgement.
- `worker.js` — Cloudflare Worker backend with `/status`, `/heartbeat`, `/ack`, and a scheduled WhatsApp fallback.
- `wrangler.toml` — the 9:15 AM Manila cron schedule and safe non-secret defaults.

## One-time setup

### 1. Meta WhatsApp Cloud API

Create or use a Meta business portfolio, WhatsApp Business Account, and business phone number. In WhatsApp Manager, create and approve a template named `jazz_daily_fallback` (or change the Worker variable to your chosen name).

Recommended template body:

`Good morning {{1}}. {{2}}`

The Worker sends:

- `{{1}}` = `Kimmy`
- `{{2}}` = the Jazz fallback report text, including the Jazz Command Center link when available

This two-variable template matches the current `worker.js` payload.

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

- `JAZZ_DEVICE_KEY`
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

Paste the deployed Worker URL once. Then paste the same private `JAZZ_DEVICE_KEY` used in the Worker settings. Jazz stores only the Worker URL and device key on that device. It does not store the WhatsApp access token.

When the status says **Connected**, the fallback is ready.

## How the online check works

When Jazz is visible, `jazz-fallback.js` sends a heartbeat and a small local report snapshot to the Worker. The snapshot can include CRM lead counts, active systems, and approval counts.

At 9:15 AM Manila time, the Worker checks whether Jazz was recently online or the report was acknowledged. If yes, it skips WhatsApp. If not, it sends the approved template once for that day.

Mobile browsers may suspend background pages, so the fallback is intentionally conservative: if Jazz cannot confirm recent activity, WhatsApp acts as the safety backup.

## Current report scope

The fallback can currently summarize Jazz data already available in the browser, including:

- Total CRM leads
- Hot leads
- Follow-up count
- Active systems
- Approval count
- Jazz Command Center link

As Gmail, Calendar, Drive, and other real backends are connected, the report builder can be expanded to include those sources too.
