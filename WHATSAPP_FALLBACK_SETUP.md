# Jazz WhatsApp Fallback — Canonical Setup

Jazz now uses the **Google Apps Script** fallback path in the live GitHub Pages Command Center.

Use **`WHATSAPP_SETUP.md`** for the current phone-friendly setup instructions.

Current behavior:

- **9:00 AM Asia/Manila:** if Jazz is open, Jazz shows and speaks the daily report.
- Jazz records a private heartbeat while the Command Center is visibly open.
- **9:15–9:29 AM Asia/Manila:** the private Apps Script backend checks whether Jazz saw Kimmy online or the report was acknowledged.
- If not, it sends the approved WhatsApp fallback through Meta WhatsApp Cloud API.
- Meta access tokens and phone-number credentials stay only in Apps Script Script Properties and are never committed to the public GitHub Pages site.

The Cloudflare Worker folders in this repository are retained only as an alternative backend reference. They are **not** the active setup used by the current Jazz Connections screen.
