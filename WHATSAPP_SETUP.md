# Jazz AI — WhatsApp Fallback Setup

This adds the rule:

**9:00 AM Manila time:** Jazz gives Kimmy the daily report when the Command Center is visibly open.

**About 9:15 AM:** if Jazz has not seen Kimmy online that morning, the private backend sends the daily fallback through WhatsApp.

## Security rule

Never paste a Meta access token into `index.html`, `whatsapp-fallback-client.js`, GitHub Pages, or any other public repository file.

The Meta token, sender phone-number ID, and receiving WhatsApp number belong only in **Google Apps Script → Project Settings → Script properties**.

## What you need

1. A Meta Developer app with WhatsApp Cloud API / WhatsApp Business Platform configured.
2. A WhatsApp Business API sender number in Meta.
3. Kimmy's receiving WhatsApp number in international digits, for example `639XXXXXXXXX`.
4. An approved WhatsApp message template, for example `jazz_daily_report`.
5. A Google Apps Script project.

## Recommended WhatsApp template

Create a template in WhatsApp Manager with two body variables.

Example body:

`Good morning. Jazz Daily Report for {{1}}: {{2}}`

The Apps Script supplies:

- `{{1}}` = the date
- `{{2}}` = the concise daily summary, including the Jazz Command Center link when available

Wait until Meta shows the template as approved before testing the scheduled fallback.

## Google Apps Script

1. Create a new Apps Script project.
2. Copy the entire contents of `whatsapp-fallback.gs` into `Code.gs`.
3. Open **Project Settings**.
4. Under **Script properties**, add:

| Property | Value |
|---|---|
| `WA_TOKEN` | Your Meta WhatsApp Cloud API access token |
| `WA_PHONE_NUMBER_ID` | Sender phone-number ID from Meta |
| `WA_RECIPIENT` | Kimmy's WhatsApp number, digits only, with country code |
| `WA_TEMPLATE_NAME` | Example: `jazz_daily_report` |
| `WA_TEMPLATE_LANG` | Example: `en_US` |
| `WA_GRAPH_VERSION` | The current Graph API version supported by your Meta app |
| `JAZZ_DEVICE_KEY` | A private random key of at least 12 characters |
| `LEADS_JSON_URL` | Optional; Jazz already has a default URL for the repository's `leads.json` |

Do **not** publish the token or device key to GitHub.

## Install the fallback clock

In Apps Script, select the function:

`setupJazzFallbackTrigger`

Tap **Run** once and approve the permissions.

It installs a five-minute clock check. The code only sends during the **9:15–9:29 AM Asia/Manila** fallback window and prevents duplicate daily sends.

## Deploy the private endpoint

In Apps Script:

1. Tap **Deploy → New deployment**.
2. Choose **Web app**.
3. Execute as: **Me**.
4. Choose an access setting that allows Jazz's GitHub Pages app to call the endpoint.
5. Deploy and copy the Web App URL ending in `/exec`.

Your private Jazz connection URL is:

`YOUR_WEB_APP_URL?key=YOUR_JAZZ_DEVICE_KEY`

Example shape only:

`https://script.google.com/macros/s/DEPLOYMENT_ID/exec?key=YOUR_PRIVATE_KEY`

Keep this combined connection URL private. It is not the Meta token, but it authorizes Jazz's heartbeat requests.

## Connect it inside Jazz

Open Jazz → **CONNECTIONS** → **WhatsApp Fallback → SET UP**.

Paste the **combined private connection URL** containing `?key=...` and tap **SAVE CONNECTION**.

That is the only value Jazz needs on the phone. The receiving WhatsApp number and all Meta credentials remain in Apps Script Script Properties.

## How the online check works

When Jazz is visibly open, `whatsapp-fallback-client.js` sends a small heartbeat and current report summary to the private Apps Script backend. No Meta access token is sent to the browser.

If Jazz is open during the 9:00–9:14 AM window, Jazz also shows and speaks the report. Acknowledging the report records that no WhatsApp fallback is needed that day.

During the 9:15–9:29 AM check window, the backend skips WhatsApp when Jazz saw Kimmy online that morning or the report was acknowledged. Otherwise it sends the approved fallback template once.

Mobile browsers may suspend background pages, so the backend is the part that performs the scheduled check; the phone page does not need to stay running in the background.

## What the first fallback report contains

The backend can read Jazz's public `leads.json` and summarize:

- Total CRM leads
- Hot leads
- Follow-up count
- A short next-action reminder

As Gmail, Calendar, Drive, approvals, orders, finance, and Live Work become real protected connections, the report builder can be expanded to include those sources too.
