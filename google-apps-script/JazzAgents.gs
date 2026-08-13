/*
 * JAZZ AI — Google Apps Script Agent Service
 * Add this file to the SAME Apps Script project as Code.gs.
 *
 * What it does:
 * - Stores Jazz agent tasks/results in a private Google Sheet in the owner's Drive.
 * - Runs AI agent work through the existing GEMINI_API_KEY when available.
 * - Records approvals/cancellations.
 * - Returns task status to the GitHub Pages Jazz Command Center through JSONP.
 *
 * SECURITY:
 * - Uses the existing JAZZ_PRESENCE_KEY check in Code.gs.
 * - Does not put Gemini keys or Google credentials in GitHub Pages.
 * - Does not send Gmail or publish content automatically.
 */

const JAZZ_AGENT_SHEET_PROPERTY = 'JAZZ_AGENT_SHEET_ID';
const JAZZ_AGENT_SHEET_NAME = 'Jazz Agent Tasks';
const JAZZ_AGENT_HEADERS = [
  'Task ID','Agent','Command','Status','Step','Result','Error','Created At','Updated At','Decision'
];
const JAZZ_AGENT_NAMES = [
  'Partnership','Social Media','Reader Care','Finance & Orders','Aiva Presentation',
  'Grant & Sponsorship','Media','Website','Knowledge','Events','Lead & CRM'
];

function jazzAgentHandleGet_(e) {
  const action = String((e && e.parameter && e.parameter.action) || '');
  if (action === 'agentStatus') {
    const sheet = jazzAgentSheet_();
    return jazzAgentJsonp_(e, {
      ok: true,
      agentService: true,
      storage: 'Google Sheets',
      sheetId: sheet.getParent().getId(),
      taskCount: Math.max(0, sheet.getLastRow() - 1)
    });
  }

  if (action === 'agentTask') {
    const id = jazzAgentCleanId_(e && e.parameter ? e.parameter.task_id : '');
    if (!id) return jazzAgentJsonp_(e, { ok: false, error: 'Task ID is missing.' });
    const task = jazzAgentReadTask_(id);
    if (!task) return jazzAgentJsonp_(e, { ok: false, error: 'Task was not found.' });
    return jazzAgentJsonp_(e, { ok: true, task: task });
  }

  if (action === 'agentTasks') {
    const limit = Math.max(1, Math.min(100, Number((e && e.parameter && e.parameter.limit) || 30)));
    return jazzAgentJsonp_(e, { ok: true, tasks: jazzAgentLatestTasks_(limit) });
  }

  return jazzAgentJsonp_(e, { ok: false, error: 'Unsupported agent GET action.' });
}

function jazzAgentHandlePost_(payload) {
  const action = String((payload && payload.action) || '');

  if (action === 'agentRun') {
    const task = jazzAgentNormalizeTask_((payload && payload.task) || {});
    jazzAgentUpsertTask_(Object.assign({}, task, {
      status: 'WORKING',
      step: 'Google Apps Script is processing the task',
      updatedAt: new Date().toISOString()
    }));

    try {
      const result = jazzAgentGenerateResult_(task);
      const finished = Object.assign({}, task, {
        status: 'WAITING FOR APPROVAL',
        step: 'Connected result ready for review',
        result: result,
        error: '',
        updatedAt: new Date().toISOString()
      });
      jazzAgentUpsertTask_(finished);
      jazzAgentAppendActivity_(task, 'RESULT_READY');
      return json_({ ok: true, task: finished });
    } catch (err) {
      const failed = Object.assign({}, task, {
        status: 'ERROR',
        step: 'Connected agent task failed',
        result: '',
        error: String(err && err.message ? err.message : err),
        updatedAt: new Date().toISOString()
      });
      jazzAgentUpsertTask_(failed);
      jazzAgentAppendActivity_(task, 'ERROR');
      return json_({ ok: false, task: failed, error: failed.error });
    }
  }

  if (action === 'agentDecision') {
    const id = jazzAgentCleanId_(payload && payload.task_id);
    const decision = String((payload && payload.decision) || '').toUpperCase();
    const current = jazzAgentReadTask_(id);
    if (!current) return json_({ ok: false, error: 'Task was not found.' });

    let status = current.status;
    let step = current.step;
    if (decision === 'APPROVE') {
      status = 'COMPLETE';
      step = 'Approved and saved in Google Sheets';
    } else if (decision === 'CANCEL') {
      status = 'CANCELLED';
      step = 'Cancelled by user';
    }

    const updated = Object.assign({}, current, {
      status: status,
      step: step,
      decision: decision,
      updatedAt: new Date().toISOString()
    });
    jazzAgentUpsertTask_(updated);
    jazzAgentAppendActivity_(updated, decision || 'DECISION');
    return json_({ ok: true, task: updated });
  }

  return json_({ ok: false, error: 'Unsupported agent POST action.' });
}

function jazzAgentJsonp_(e, value) {
  const raw = String((e && e.parameter && e.parameter.callback) || '');
  const callback = /^[A-Za-z_$][A-Za-z0-9_$.]*$/.test(raw) ? raw : '';
  if (!callback) return json_(value);
  return ContentService
    .createTextOutput(callback + '(' + JSON.stringify(value) + ');')
    .setMimeType(ContentService.MimeType.JAVASCRIPT);
}

function jazzAgentCleanId_(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 100);
}

function jazzAgentNormalizeTask_(raw) {
  const id = jazzAgentCleanId_(raw && raw.id);
  if (!id) throw new Error('Task ID is missing.');
  const agent = String((raw && raw.agent) || '').trim();
  if (JAZZ_AGENT_NAMES.indexOf(agent) === -1) throw new Error('Unknown Jazz agent.');
  const command = String((raw && raw.command) || '').trim().slice(0, 8000);
  if (!command) throw new Error('Task command is empty.');
  return {
    id: id,
    agent: agent,
    command: command,
    status: String((raw && raw.status) || 'DEPLOYING'),
    step: String((raw && raw.step) || 'Receiving instruction'),
    result: String((raw && raw.result) || ''),
    error: String((raw && raw.error) || ''),
    createdAt: String((raw && raw.createdAt) || new Date().toISOString()),
    updatedAt: String((raw && raw.updatedAt) || new Date().toISOString()),
    decision: String((raw && raw.decision) || '')
  };
}

function jazzAgentSheet_() {
  const p = props_();
  let spreadsheet = null;
  const savedId = p.getProperty(JAZZ_AGENT_SHEET_PROPERTY);
  if (savedId) {
    try { spreadsheet = SpreadsheetApp.openById(savedId); } catch (_) {}
  }

  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create('Jazz AI Command Center — Private Agent Data');
    p.setProperty(JAZZ_AGENT_SHEET_PROPERTY, spreadsheet.getId());
  }

  let sheet = spreadsheet.getSheetByName(JAZZ_AGENT_SHEET_NAME);
  if (!sheet) sheet = spreadsheet.insertSheet(JAZZ_AGENT_SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, JAZZ_AGENT_HEADERS.length).setValues([JAZZ_AGENT_HEADERS]);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function jazzAgentRowFromTask_(task) {
  return [
    task.id, task.agent, task.command, task.status, task.step,
    task.result || '', task.error || '', task.createdAt || '', task.updatedAt || '', task.decision || ''
  ];
}

function jazzAgentTaskFromRow_(row) {
  return {
    id: String(row[0] || ''),
    agent: String(row[1] || ''),
    command: String(row[2] || ''),
    status: String(row[3] || ''),
    step: String(row[4] || ''),
    result: String(row[5] || ''),
    error: String(row[6] || ''),
    createdAt: jazzAgentCellDate_(row[7]),
    updatedAt: jazzAgentCellDate_(row[8]),
    decision: String(row[9] || '')
  };
}

function jazzAgentCellDate_(value) {
  if (value instanceof Date) return value.toISOString();
  return String(value || '');
}

function jazzAgentFindRow_(id) {
  const sheet = jazzAgentSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return { sheet: sheet, row: 0 };
  const ids = sheet.getRange(2, 1, last - 1, 1).getDisplayValues();
  for (let i = 0; i < ids.length; i += 1) {
    if (String(ids[i][0]) === id) return { sheet: sheet, row: i + 2 };
  }
  return { sheet: sheet, row: 0 };
}

function jazzAgentUpsertTask_(task) {
  const normalized = jazzAgentNormalizeTask_(task);
  const found = jazzAgentFindRow_(normalized.id);
  const row = jazzAgentRowFromTask_(normalized);
  if (found.row) found.sheet.getRange(found.row, 1, 1, row.length).setValues([row]);
  else found.sheet.appendRow(row);
  return normalized;
}

function jazzAgentReadTask_(id) {
  const clean = jazzAgentCleanId_(id);
  if (!clean) return null;
  const found = jazzAgentFindRow_(clean);
  if (!found.row) return null;
  const row = found.sheet.getRange(found.row, 1, 1, JAZZ_AGENT_HEADERS.length).getValues()[0];
  return jazzAgentTaskFromRow_(row);
}

function jazzAgentLatestTasks_(limit) {
  const sheet = jazzAgentSheet_();
  const last = sheet.getLastRow();
  if (last < 2) return [];
  const start = Math.max(2, last - limit + 1);
  const rows = sheet.getRange(start, 1, last - start + 1, JAZZ_AGENT_HEADERS.length).getValues();
  return rows.reverse().map(jazzAgentTaskFromRow_);
}

function jazzAgentAppendActivity_(task, action) {
  const sheet = jazzAgentSheet_();
  const spreadsheet = sheet.getParent();
  let log = spreadsheet.getSheetByName('Jazz Activity Log');
  if (!log) {
    log = spreadsheet.insertSheet('Jazz Activity Log');
    log.appendRow(['Timestamp','Task ID','Agent','Action','Status']);
    log.setFrozenRows(1);
  }
  log.appendRow([new Date(), task.id, task.agent, String(action || ''), task.status || '']);
}

function jazzAgentGenerateResult_(task) {
  const p = props_();
  const apiKey = p.getProperty('GEMINI_API_KEY') || '';
  if (!apiKey) return jazzAgentFallbackResult_(task);

  const model = p.getProperty('GEMINI_MODEL') || (typeof DEFAULT_GEMINI_MODEL !== 'undefined' ? DEFAULT_GEMINI_MODEL : 'gemini-2.5-flash');
  const prompt = [
    'You are the ' + task.agent + ' Agent inside Jazz AI, a private AI Chief of Staff.',
    'Complete the user task below and return ONLY the finished result that the user can review.',
    'Be truthful. Do not claim you searched the web, Gmail, Drive, Calendar, CRM, or any external service unless actual data is included in the prompt.',
    'Do not send, publish, delete, purchase, or make consequential changes. Prepare the result for approval.',
    'Use clear, concise, Parkinson-friendly formatting with short sections.',
    '',
    'TASK:',
    task.command,
    '',
    'AGENT ROLE:',
    jazzAgentRole_(task.agent)
  ].join('\n');

  const body = {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 4096 }
  };
  const response = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    }
  );
  const code = response.getResponseCode();
  const text = response.getContentText();
  if (code < 200 || code >= 300) throw new Error('AI agent service failed (' + code + ').');

  const data = JSON.parse(text || '{}');
  const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content &&
    Array.isArray(data.candidates[0].content.parts) ? data.candidates[0].content.parts : [];
  const result = parts.map(function(part) { return String(part.text || ''); }).join('').trim();
  if (!result) throw new Error('AI agent returned no result.');
  return result;
}

function jazzAgentRole_(agent) {
  const roles = {
    'Partnership': 'Partnership research preparation, proposals, outreach drafts, lead follow-up planning.',
    'Social Media': 'Social posts, captions, content plans, campaign ideas, hashtags and short-form content.',
    'Reader Care': 'Warm reader replies, feedback organization, testimonial handling and reader support drafts.',
    'Finance & Orders': 'Order/payment summaries and finance workflow support. Never invent financial records.',
    'Aiva Presentation': 'Speeches, presentation outlines, slide content, speaker notes, openings, closings and Q&A.',
    'Grant & Sponsorship': 'Grant/sponsorship preparation, checklists, letters, eligibility questions and application drafts.',
    'Media': 'Press releases, interview talking points, media pitches and press preparation.',
    'Website': 'Website copy, change plans, SEO descriptions and technical task preparation. Never claim publishing unless it happened.',
    'Knowledge': 'Organize and explain provided or stored Jazz information. Never invent memory.',
    'Events': 'Event plans, run-of-show, invitations, schedules, attendee workflows and follow-ups.',
    'Lead & CRM': 'Lead categorization, follow-up planning and CRM summaries. Never invent contacts.'
  };
  return roles[agent] || 'General private assistant work.';
}

function jazzAgentFallbackResult_(task) {
  const title = task.agent.toUpperCase() + ' AGENT — CONNECTED RESULT';
  const common = title + '\n\nTask: ' + task.command + '\n\n';
  if (task.agent === 'Social Media') {
    return common + 'Draft:\nStrength is not always loud. Sometimes it is choosing hope, purpose, and one more step forward even when life changes the plan.\n\nReview before posting.';
  }
  if (task.agent === 'Events') {
    return common + 'Event checklist:\n• Confirm date, time, venue and objective\n• Confirm guests/speakers\n• Prepare program flow\n• Check accessibility and materials\n• Save follow-ups after the event';
  }
  if (task.agent === 'Lead & CRM' || task.agent === 'Finance & Orders' || task.agent === 'Knowledge') {
    return common + 'The Apps Script connection is working, but this task needs a connected data source before Jazz can truthfully return records. No data was invented.';
  }
  return common + 'The Apps Script connection is working. Add GEMINI_API_KEY to Apps Script Script Properties for customized AI-generated results. This task was saved safely for review.';
}

/* Optional manual test inside Apps Script after deployment. */
function testJazzAgentService() {
  const test = jazzAgentNormalizeTask_({
    id: 'manual_' + Date.now(),
    agent: 'Knowledge',
    command: 'Confirm that the Jazz agent service can save a task.',
    status: 'WORKING',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  });
  jazzAgentUpsertTask_(test);
  console.log(JSON.stringify(jazzAgentReadTask_(test.id)));
  return true;
}
