# Jazz AI — Real System Builder Setup

Jazz now supports a real build pipeline:

**Approved plan → Gemini generates actual app files → GitHub repository → GitHub Pages → verified HTTPS URL → LIVE**

Jazz does not mark a system LIVE until the deployed page is reachable.

## 1. Update the Apps Script code

Replace the existing Apps Script `Code.gs` with the current file from:

`google-apps-script/Code.gs`

Then update the Web App deployment to a new version.

## 2. Required Script Properties

Keep every secret in **Apps Script → Project Settings → Script Properties**.

Add:

- `GITHUB_OWNER` = your GitHub username
- `GITHUB_TOKEN` = a private GitHub token
- `GEMINI_API_KEY` = your private Gemini API key
- `GEMINI_MODEL` = `gemini-3.6-flash` (optional; this is the default)

Jazz also uses the existing:

- `JAZZ_PRESENCE_KEY`
- `FACEBOOK_APP_ID`
- `FACEBOOK_APP_SECRET`
- `META_GRAPH_VERSION`

Never put `GITHUB_TOKEN`, `GEMINI_API_KEY`, `FACEBOOK_APP_SECRET`, access tokens, or the presence key in public GitHub Pages files.

## 3. GitHub token permissions

For a fine-grained token used by the automatic builder, give Jazz only the permissions needed to create and publish its system repositories:

- Repository access: **All repositories** (needed so the token can work with newly created Jazz system repositories)
- **Administration: Read and write**
- **Contents: Read and write**
- **Pages: Read and write**

Do not paste the token into ChatGPT or commit it to GitHub. Save it only as the `GITHUB_TOKEN` Script Property.

## 4. Gemini key

Create a Gemini API key in Google AI Studio and store it only as `GEMINI_API_KEY` in Apps Script Script Properties.

The builder uses the Gemini `generateContent` API server-side to produce a self-contained deployable `index.html`.

## 5. Apps Script Web App

Deploy the Apps Script as a Web App:

- Execute as: **Me**
- Access: **Anyone**

The builder actions are protected by `JAZZ_PRESENCE_KEY`.

Use the deployed Web App URL with the private key in Jazz, for example:

`https://script.google.com/macros/s/DEPLOYMENT_ID/exec?key=YOUR_PRIVATE_KEY`

Keep this private URL private.

## 6. What Live Work reports

Jazz polls the private backend and shows actual stages:

1. Generating real application files
2. Creating GitHub repository
3. Uploading application files
4. Enabling GitHub Pages
5. Verifying deployment
6. LIVE

If Gemini, GitHub, or deployment fails, Jazz shows **BUILD ERROR** instead of pretending the system is complete.

## Security / architecture note

Systems generated for GitHub Pages are real deployed web applications. Their persistent records use browser storage such as IndexedDB unless a separate secure server/database is explicitly connected. Jazz must not pretend that static GitHub Pages provides secure multi-user authentication or shared cloud databases by itself.
