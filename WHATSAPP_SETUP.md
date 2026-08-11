# Jazz AI — WhatsApp Fallback Setup

This is the active phone-friendly setup for Jazz.

**9:00 AM Asia/Manila:** if the Jazz Command Center is open, Jazz shows and speaks the daily report.

**9:15–9:29 AM:** if the private backend has not seen Jazz online since 9:00 AM, it sends one WhatsApp fallback report.

## Security rule

Never paste a Meta access token into `index.html`, `whatsapp-fallback-client.js`, GitHub Pages, or any public repository file.

The Meta token, sender phone-number ID, receiving WhatsApp number, and private Jazz key belong only in **Google Apps Script → Project Settings → Script properties**.

## What you need

1. A Meta Developer app with WhatsApp Cloud API / WhatsApp Business Platform configured.
2. A WhatsApp Business sender number in Meta.
3. Kimmy's receiving WhatsApp number in international digits, for example `639XXXXXXXXX`.
4. An approved WhatsApp message template, for example `jazz_daily_report`.
5. A Google Apps Script project.

## Recommended WhatsApp template

Create a template in WhatsApp Manager with **two body variables**.

Recommended body:

`Good morning, Kimmy. Jazz Daily Report for {{1}}: {{2}} Open Jazz: https://dariakimberly4-netizen.github.io/jazz-ai-command-center/`

The Apps Script supplies:

- `{{1}}` = the date
- `{{2}}` = the concise Jazz report summary

Wait until Meta shows the template as approved before testing the scheduled fallback.

## Google Apps Script

1. Create a new Apps Script project.
2. In this repository, open **`google-apps-script/Code.gs`**.
3. Copy its entire contents into the Apps Script project's `Code.gs`.
4. Set the Apps Script project timezone to **Asia/Manila**.
5. Open **Project Settings → Script properties** and add:

| Property | Value |
|---|---|
| `WA_ACCESS_TOKEN` | Meta WhatsApp Cloud API access token |
| `WA_PHONE_NUMBER_ID` | Sender phone-number ID from Meta |
| `WA_RECIPIENT` | Kimmy's WhatsApp number, digits only, with country code |
| `WA_TEMPLATE_NAME` | Example: `jazz_daily_report` |
| `WA_TEMPLATE_LANGUAGE` | Example: `en_US` |
| `META_GRAPH_VERSION` | The Graph API version supported by your Meta app |
| `JAZZ_PRESENCE_KEY` | A private random key of at least 12 characters |
| `LEADS_JSON_URL` | `https://raw.githubusercontent.com/dariakimberly4-netizen/jazz-ai-command-center/main/leads.json` |

Do **not** publish these private values to GitHub.

## Install the fallback clock

In Apps Script, choose the function:

`installDailyFallbackTrigger`

Tap **Run** once and approve the requested permissions.

It installs a five-minute clock check. The code only sends during the **9:15–9:29 AM Asia/Manila** window and prevents duplicate daily sends.

## Deploy the private endpoint

In Apps Script:

1. Tap **Deploy → New deployment**.
2. Choose **Web app**.
3. Execute as: **Me**.
4. Choose an access setting that lets the Jazz GitHub Pages app call the endpoint.
5. Deploy and copy the Web App URL ending in `/exec`.

Create your private Jazz connection URL by adding the same private key:

`YOUR_WEB_APP_URL?key=YOUR_JAZZ_PRESENCE_KEY`

Example shape only:

`https://script.google.com/macros/s/DEPLOYMENT_ID/exec?key=YOUR_PRIVATE_KEY`

Keep this combined URL private.

## Connect it inside Jazz

Open Jazz → **CONNECTIONS** → **WhatsApp Fallback → SET UP**.

Paste the combined private connection URL containing `?key=...` and tap **SAVE CONNECTION**.

That is the only private value Jazz needs on the phone. The receiving WhatsApp number and Meta credentials stay in Apps Script.

## Test it

After the Meta template is approved, run this function once inside Apps Script:

`testWhatsAppFallback`

A successful test should send the approved Jazz template to the WhatsApp recipient configured in `WA_RECIPIENT`.

## How Jazz knows you are online

`whatsapp-fallback-client.js` sends a small heartbeat only while Jazz is visibly open. It also shows and speaks the 9:00 AM report locally during the 9:00–9:14 window.

At 9:15–9:29 AM, Apps Script checks whether Jazz recorded a heartbeat after 9:00 AM. If yes, WhatsApp is skipped. If no, the backend sends the fallback once.

The fallback summary currently uses Jazz's CRM lead data. As Gmail, Calendar, Drive, orders, finance, approvals, and Live Work become real protected connections, the WhatsApp report can be expanded to include them too.
