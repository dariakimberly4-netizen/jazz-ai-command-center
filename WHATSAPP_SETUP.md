# Jazz WhatsApp Fallback — One-time setup

Jazz is prepared to send a WhatsApp fallback at **9:15 AM Asia/Manila** when the Command Center has not been seen within the previous 20 minutes.

The public Jazz page never stores your WhatsApp access token. Private credentials stay in **GitHub Actions Secrets**.

## 1. Create the WhatsApp template

In Meta WhatsApp Manager, create and submit this template for approval:

- Template name: `jazz_daily_report`
- Language: English (`en`)
- Suggested body:

`Good morning {{1}}. Jazz 9 AM report: {{2}} Open Jazz: {{3}}`

The workflow supplies:

1. `Kimmy`
2. A concise CRM/report summary
3. The Jazz Command Center link

## 2. Create the small presence endpoint

Create a Google Apps Script project and paste the contents of:

`integrations/presence-apps-script.gs`

Deploy it as a **Web app**:

- Execute as: Me
- Who has access: Anyone

Copy the deployed `/exec` web-app URL.

## 3. Add GitHub Actions Secrets

Repository → **Settings → Secrets and variables → Actions → Secrets**

Create these secrets:

- `WHATSAPP_TOKEN` — Meta WhatsApp Cloud API access token
- `WHATSAPP_PHONE_NUMBER_ID` — the WhatsApp Cloud API phone-number ID
- `WHATSAPP_TO` — the WhatsApp recipient number in international format, digits only
- `JAZZ_PRESENCE_URL` — the Apps Script `/exec` URL from step 2

## 4. Add GitHub Actions Variables

Repository → **Settings → Secrets and variables → Actions → Variables**

Create:

- `META_GRAPH_VERSION` — the Graph API version shown in your current Meta app/dashboard, including the `v` prefix
- `WHATSAPP_TEMPLATE_NAME` = `jazz_daily_report`
- `WHATSAPP_TEMPLATE_LANG` = `en`

## 5. Arm presence checking in Jazz

Open Jazz → **CONNECTIONS → WhatsApp Fallback → SET UP**.

Paste the same Apps Script `/exec` URL and tap **SAVE**.

Jazz will ping that endpoint only while the Command Center is open/visible. At 9:15 AM, the GitHub workflow checks the last-seen time. If Jazz was seen recently, WhatsApp is skipped. Otherwise, the approved WhatsApp template is sent.

## 6. Test once

GitHub → **Actions → Jazz WhatsApp Fallback → Run workflow**.

Turn on **force_send** only for the test. This bypasses the online check once and confirms that Meta credentials and the approved template work.

## Safety notes

- Never paste the WhatsApp access token into `index.html`, JavaScript, a public issue, or a public commit.
- The workflow exits safely without sending when the required secrets/variables are missing.
- The current WhatsApp summary is based on data Jazz already has in the repository. Gmail, Calendar, and Drive details will only be included after those services have real authorized integrations.
