# Jazz AI — WhatsApp Fallback Setup

This adds the rule:

**9:00 AM Manila time:** Jazz gives Kimmy the daily report when the Command Center is visibly open.

**About 9:15 AM:** if Jazz has not seen Kimmy online that morning, the private backend sends the daily fallback through WhatsApp.

## Security rule

Never paste a Meta access token into `index.html`, `whatsapp-fallback.js`, GitHub Pages, or any other public repository file.

The Meta token and WhatsApp phone-number ID belong only in **Google Apps Script → Project Settings → Script properties**.

## What you need

1. A Meta Developer app with **WhatsApp Cloud API** / WhatsApp Business Platform configured.
2. A WhatsApp Business API sender number in Meta.
3. Kimmy's receiving WhatsApp number in international digits, for example `639XXXXXXXXX`.
4. An approved WhatsApp message template called, for example, `jazz_daily_report`.
5. A Google Apps Script project.

## Recommended WhatsApp template

Create a template in WhatsApp Manager with two body variables.

Example body:

`Good morning Kimmy. Jazz Daily Report for {{1}}: {{2}} Open Jazz Command Center: https://dariakimberly4-netizen.github.io/jazz-ai-command-center/`

The Apps Script supplies:

- `{{1}}` = the date
- `{{2}}` = the concise daily summary

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
| `WA_GRAPH_VERSION` | The current Graph API version shown/supported by your Meta app, such as `vXX.X` |
| `JAZZ_DEVICE_KEY` | A private random key of at least 12 characters |
| `LEADS_JSON_URL` | `https://raw.githubusercontent.com/dariakimberly4-netizen/jazz-ai-command-center/main/leads.json` |

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
4. Choose the access option required for Jazz's GitHub Pages request to reach the web app.
5. Deploy and copy the Web App URL ending in `/exec`.

Treat that URL as private configuration even though it is not the Meta token.

## Connect it inside Jazz

Open Jazz → **CONNECTIONS** → **WhatsApp Fallback → SET UP**.

Enter:

- Your receiving WhatsApp number
- The Apps Script Web App URL
- The same `JAZZ_DEVICE_KEY`

Turn **WhatsApp fallback ON** and tap **SAVE**.

Then tap **TEST**. Jazz sends a test request to the private Apps Script backend, which sends the approved WhatsApp template through Meta.

## How the online check works

When Jazz is visibly open, `whatsapp-fallback.js` sends a small heartbeat to the private Apps Script backend. No Meta token is sent to the browser.

At the fallback check, the backend looks for a heartbeat from that morning. If it saw Kimmy online after 9:00 AM, it skips WhatsApp. If it did not, it sends the fallback template once.

Mobile browsers may suspend background pages, so the fallback is intentionally conservative: if Jazz cannot confirm that the page is visibly active, WhatsApp may still be sent as a safety backup.

## What the first fallback report contains

The backend can read the public `leads.json` and summarize:

- Total CRM leads
- Hot leads
- Follow-up count
- A short next-action reminder

As Gmail, Calendar, Drive, approvals, and live-work backends become real connections, the report builder can be expanded to include those sources too.
