const PRESENCE_KEY = 'JAZZ_LAST_SEEN';

function doGet(e) {
  const action = String((e && e.parameter && e.parameter.action) || '').toLowerCase();
  const props = PropertiesService.getScriptProperties();

  if (action === 'ping') {
    const now = new Date().toISOString();
    props.setProperty(PRESENCE_KEY, now);
    return json_({ ok: true, lastSeen: now });
  }

  if (action === 'status') {
    return json_({ ok: true, lastSeen: props.getProperty(PRESENCE_KEY) || null });
  }

  return json_({ ok: false, message: 'Use ?action=ping or ?action=status' });
}

function doPost(e) {
  return doGet(e);
}

function json_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
