# Jazz WhatsApp Fallback

This feature is designed so Jazz can prepare a starter daily report at **9:00 AM Asia/Manila** and, if Kimmy has not acknowledged the report and Jazz is not online, send a WhatsApp fallback at **9:15 AM Asia/Manila**.

## Safety design

- The public GitHub Pages site must never contain a WhatsApp access token.
- WhatsApp credentials stay only in a protected backend as encrypted secrets.
- Jazz sends a heartbeat only to the protected backend so it can tell whether the Command Center is currently open.
- The backend stores only lightweight presence/report state in Cloudflare KV.
- A daily fallback is sent at most once.

## What the backend already supports

The Worker in `whatsapp-worker/worker.js` provides:

- `POST /heartbeat` — records that Jazz is currently open.
- `POST /ack` — records that today's report has been seen.
- `GET /today` — returns today's prepared report.
- `POST /report` — lets a future protected Jazz service replace the starter report with a richer report.
- `GET /status` — confirms whether the WhatsApp backend is configured without revealing secrets.
- 9:00 AM Manila scheduled report preparation.
- 9:15 AM Manila scheduled offline/acknowledgement check and WhatsApp fallback.

The starter 9:00 AM report currently uses Jazz's public `leads.json` to create a factual CRM summary. As Gmail, Calendar, Drive, orders, finance, and other protected services are connected later, they can replace that starter report through the protected `/report` endpoint.

## Cloudflare setup

1. Create a Cloudflare Worker named `jazz-whatsapp-fallback`.
2. Create a Workers KV namespace and bind it to the Worker as `JAZZ_STATE`.
3. Use `whatsapp-worker/worker.js` as the Worker code.
4. Configure the two Cron Triggers from `whatsapp-worker/wrangler.toml.example`:
   - `0 1 * * *` — 9:00 AM Manila.
   - `15 1 * * *` — 9:15 AM Manila.
5. Add the non-secret variables shown in `wrangler.toml.example`.
6. Add these encrypted Worker secrets:
   - `WHATSAPP_PHONE_NUMBER_ID`
   - `WHATSAPP_ACCESS_TOKEN`
   - `WHATSAPP_TO` — Kimmy's WhatsApp number in international format.
   - `JAZZ_BACKEND_KEY` — a long random secret for protected report updates.
7. Set `META_GRAPH_VERSION` to a current supported Meta Graph API version.
8. In WhatsApp Manager, create and approve a template named `jazz_daily_report` with one body text variable, for example: `Good morning Kimmy. Jazz Daily Report: {{1}}`.
9. Test `GET /status`. It should return `configured: true` only after all required WhatsApp settings are present.
10. Wire the deployed Worker URL into Jazz's Connections screen. The public page should store only the Worker URL, never WhatsApp credentials.

## Fallback rule

At 9:15 AM Manila, the Worker does **not** send WhatsApp when either:

- today's report has already been acknowledged; or
- Jazz has sent a heartbeat within the previous three minutes.

Otherwise it sends the latest report using the approved WhatsApp template and records that the fallback was sent so it cannot duplicate the message that day.

## Important

The WhatsApp fallback is not live until the Cloudflare Worker is deployed, its KV binding is created, Meta/WhatsApp credentials are added as encrypted secrets, the message template is approved, and the deployed Worker URL is wired into `index.html`.
