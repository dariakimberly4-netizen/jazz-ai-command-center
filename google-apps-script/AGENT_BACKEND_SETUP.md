# Jazz AI — Turn On Google Apps Script Agents

Jazz no longer uses Supabase for agent cloud memory. The GitHub frontend now expects the private Google Apps Script backend.

## 1. Add the agent file

In the SAME Apps Script project already used by Jazz, create a new script file named:

`JazzAgents.gs`

Copy the complete contents of this repository file into it:

`google-apps-script/JazzAgents.gs`

## 2. Add this to `doGet(e)`

Immediately after this existing line:

```javascript
const action = e && e.parameter ? String(e.parameter.action || '') : '';
```

add:

```javascript
if (action === 'agentStatus' || action === 'agentTask' || action === 'agentTasks') {
  requirePresenceKey_(e, {});
  return jazzAgentHandleGet_(e);
}
```

## 3. Add this to `doPost(e)`

Immediately after this existing line:

```javascript
const action = String(payload.action || '');
```

add:

```javascript
if (action === 'agentRun' || action === 'agentDecision') {
  return jazzAgentHandlePost_(payload);
}
```

## 4. Redeploy the EXISTING Web App

In Apps Script:

**Deploy → Manage deployments → Edit → New version → Deploy**

Do not create a different public URL unless the old deployment cannot be edited. Keeping the existing deployment means Jazz can reuse the private URL already saved on the device.

## 5. Test in Jazz

Open Jazz → **Connections** → **Google Apps Script Agents** → **CHECK**.

The status should change to:

**Connected • agent service ready**

Then test:

`Create a Facebook post for Beyond the Tremor`

Jazz should show:

**DEPLOYING → WORKING → WAITING FOR APPROVAL**

and the result should be saved in a private Google Sheet named:

**Jazz AI Command Center — Private Agent Data**

## Security

- Keep `JAZZ_PRESENCE_KEY` and `GEMINI_API_KEY` only in Apps Script **Script Properties**.
- Do not paste secret keys into GitHub Pages.
- The Google Sheet is created in the Apps Script owner's Drive.
- Agents prepare results for approval; they do not automatically send emails or publish content.
