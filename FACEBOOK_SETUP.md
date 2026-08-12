# Jazz AI — Facebook Page Connection

Jazz now has a secure Facebook Page connection flow.

## What is already built

- Facebook Page appears inside **Jazz → Connections**.
- Tapping **CONNECT** opens Meta/Facebook authorization.
- The public GitHub Pages site never receives your Meta App Secret or Facebook Page access token.
- The private Google Apps Script backend exchanges the OAuth code, finds the Pages you manage, and stores the selected Page token in **Script Properties**.
- If Meta returns more than one Page, Jazz shows a large one-tap Page chooser.
- After authorization, Jazz returns to the Command Center and shows the connected Page name.

## Private Script Properties

In the same Google Apps Script project used by Jazz, add these private properties:

| Property | Value |
|---|---|
| `FACEBOOK_APP_ID` | Your Meta Developer App ID |
| `FACEBOOK_APP_SECRET` | Your Meta Developer App Secret |
| `META_GRAPH_VERSION` | The Graph API version enabled for the Meta app, for example `vXX.X` |
| `JAZZ_PRESENCE_KEY` | Your existing private Jazz key |
| `FACEBOOK_REDIRECT_URI` | Your deployed Apps Script Web App `/exec` URL |
| `FACEBOOK_RETURN_URL` | `https://dariakimberly4-netizen.github.io/jazz-ai-command-center/` |
| `FACEBOOK_PAGE_NAME` | Optional preferred Page name; use this if you manage multiple Pages |
| `FACEBOOK_SCOPES` | Optional. Default: `pages_show_list,pages_read_engagement,pages_manage_posts` |

Never put the App Secret or Page token in GitHub.

## Meta app

Use a Meta Developer app that supports Facebook Login / Facebook authorization for your Page. Configure the exact Apps Script Web App URL from `FACEBOOK_REDIRECT_URI` as an allowed OAuth redirect URI.

Jazz requests these Page permissions by default:

- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_posts`

Only request additional permissions later when a real Jazz feature needs them.

## Update the private backend

The GitHub copy of the backend is:

`google-apps-script/Code.gs`

Copy the latest version into the existing Apps Script project and **Deploy → Manage deployments → Edit → New version → Deploy** so the live Web App receives the Facebook functions.

The redirect URI must continue to be the deployed `/exec` URL.

## Connect from Jazz

1. Open Jazz AI Command Center.
2. Open **CONNECTIONS**.
3. Tap **Facebook Page → CONNECT**.
4. Facebook opens its authorization screen.
5. Approve the requested Page access.
6. If you manage several Pages, tap the Page Jazz should use.
7. Jazz returns to the Command Center and displays **Connected • [Page name]**.

## Test

Inside Apps Script, run:

`testFacebookConnection`

It should return the connected Page ID and Page name without exposing the stored access token.

A future Jazz-approved posting workflow can call the protected backend helper:

`publishFacebookText(message)`

Do not expose that helper directly to unauthenticated public requests. Keep Jazz approvals in front of any publishing action.
