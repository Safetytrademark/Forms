const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendSafetySubmission({ foremanName, project, submissionType, date, workersOnSite, fields, pdfBuffer, pdfName, photos }) {
  const recipient = process.env.EMAIL_TO || 'safetyinfo@trademarkmasonry.ca';

  const parsedFields = typeof fields === 'string' ? JSON.parse(fields) : (fields || {});

  // ── Field renderers ────────────────────────────────────────────────────────
  const CELL_LABEL = `padding:10px 14px;background:#fafafa;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #eee;width:38%;vertical-align:top`;
  const CELL_VALUE = `padding:10px 14px;color:#222;font-size:14px;border-bottom:1px solid #eee;line-height:1.6;vertical-align:top`;
  const TH = `padding:7px 10px;background:#f0f0f0;font-size:11px;font-weight:700;text-transform:uppercase;color:#555;text-align:center;border:1px solid #ddd;white-space:nowrap`;
  const TD = `padding:7px 10px;font-size:13px;text-align:center;border:1px solid #ddd`;

  function labelOf(k) {
    return k.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  function simpleRow(k, html) {
    return `<tr><td style="${CELL_LABEL}">${labelOf(k)}</td><td style="${CELL_VALUE}">${html}</td></tr>`;
  }

  function renderTimesheetRows(employees) {
    const days = ['mon','tue','wed','thu','fri','sat','sun'];
    const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    const thead = `<tr><th style="${TH};text-align:left;width:30%">Employee</th>${dayLabels.map(d=>`<th style="${TH}">${d}<br><small style="color:#888;font-weight:400">R / OT</small></th>`).join('')}<th style="${TH}">Total R</th><th style="${TH}">Total OT</th></tr>`;
    const tbody = employees.map(emp => {
      let totalR = 0, totalOT = 0;
      const dayCells = days.map(d => {
        const r = parseFloat(emp.days?.[d]?.r) || 0;
        const ot = parseFloat(emp.days?.[d]?.ot) || 0;
        totalR += r; totalOT += ot;
        const rStr = r > 0 ? r : '—';
        const otStr = ot > 0 ? `<span style="color:#ef4444">${ot}</span>` : '—';
        return `<td style="${TD}">${rStr} / ${otStr}</td>`;
      }).join('');
      return `<tr><td style="${TD};text-align:left;font-weight:600">${emp.name || '—'}</td>${dayCells}<td style="${TD};font-weight:700;color:#1a2e4a">${totalR}</td><td style="${TD};font-weight:700;color:#ef4444">${totalOT || '—'}</td></tr>`;
    }).join('');
    return `<tr><td colspan="2" style="padding:0;border-bottom:1px solid #eee">
      <div style="${CELL_LABEL};border-bottom:1px solid #eee">Timesheet</div>
      <div style="overflow-x:auto;padding:10px 14px">
        <table style="width:100%;border-collapse:collapse">${thead}${tbody}</table>
      </div></td></tr>`;
  }

  function renderFlraRows(tasks) {
    const included = tasks.filter(t => t.included !== false);
    if (!included.length) return '';
    const riskColor = { high:'#ef4444', medium:'#f59e0b', low:'#10b981' };
    const rows = included.map(t => {
      const rc = riskColor[(t.riskLevel||'low').toLowerCase()] || '#888';
      const hazards = Array.isArray(t.hazards) ? t.hazards.filter(Boolean).join(', ') : (t.hazards || '');
      return `<tr>
        <td style="${TD};text-align:left;font-weight:600">${t.task || '—'}</td>
        <td style="${TD}"><span style="color:${rc};font-weight:700">${t.riskLevel || '—'}</span></td>
        <td style="${TD};text-align:left;color:#555">${hazards || '—'}</td>
        <td style="${TD};text-align:left;color:#333">${t.controls || '—'}</td>
      </tr>`;
    }).join('');
    const thead = `<tr><th style="${TH};text-align:left">Task</th><th style="${TH}">Risk</th><th style="${TH};text-align:left">Hazards</th><th style="${TH};text-align:left">Controls</th></tr>`;
    return `<tr><td colspan="2" style="padding:0;border-bottom:1px solid #eee">
      <div style="${CELL_LABEL};border-bottom:1px solid #eee">FLRA Tasks (${included.length})</div>
      <div style="overflow-x:auto;padding:10px 14px">
        <table style="width:100%;border-collapse:collapse">${thead}${rows}</table>
      </div></td></tr>`;
  }

  function renderCrewSignin(members) {
    const names = members.map((m, i) => `<span style="display:inline-block;background:#f0f0f0;border-radius:20px;padding:3px 12px;font-size:13px;margin:3px">${m.name || `Worker ${i+1}`}</span>`).join('');
    return names;
  }

  function renderChecklist(obj) {
    return Object.entries(obj).map(([label, checked]) => {
      const icon = checked ? `<span style="color:#10b981;font-weight:700">✓</span>` : `<span style="color:#ccc">○</span>`;
      return `<span style="display:inline-block;margin:3px 10px 3px 0;white-space:nowrap;font-size:13px">${icon} ${label}</span>`;
    }).join('');
  }

  // Daily inspection: { sectionName: { itemText: 'ok'|'x'|null } }
  function renderDailyInspectionHtml(k) {
    const sections = parsedFields[k];
    let html = '';
    for (const [secName, items] of Object.entries(sections)) {
      const rows = Object.entries(items).map(([item, status]) => {
        const icon = status === 'ok'
          ? `<span style="color:#10b981;font-weight:700">✓</span>`
          : status === 'x'
          ? `<span style="color:#ef4444;font-weight:700">✗</span>`
          : `<span style="color:#ccc">—</span>`;
        return `<tr><td style="${TD};text-align:left;width:30px">${icon}</td><td style="${TD};text-align:left">${item}</td></tr>`;
      }).join('');
      html += `<div style="margin-bottom:12px">
        <div style="font-weight:700;font-size:12px;text-transform:uppercase;color:#555;letter-spacing:.04em;padding:6px 0;border-bottom:1px solid #eee;margin-bottom:4px">${secName}</div>
        <table style="width:100%;border-collapse:collapse">${rows}</table>
      </div>`;
    }
    return `<tr><td colspan="2" style="padding:0;border-bottom:1px solid #eee">
      <div style="${CELL_LABEL};border-bottom:1px solid #eee">${labelOf(k)}</div>
      <div style="padding:12px 14px">${html}</div></td></tr>`;
  }

  // Toolbox hazard review: [{hazard, risk, control, included}]
  function renderToolboxHazardsHtml(k, v) {
    const included = v.filter(r => r.included && (r.hazard || r.risk || r.control));
    if (!included.length) return '';
    const riskColor = { high:'#ef4444', medium:'#f59e0b', low:'#10b981' };
    const thead = `<tr><th style="${TH};text-align:left">Hazard</th><th style="${TH}">Risk</th><th style="${TH};text-align:left">Control</th></tr>`;
    const rows = included.map(r => {
      const rc = riskColor[(r.risk||'').toLowerCase()] || '#888';
      return `<tr>
        <td style="${TD};text-align:left">${r.hazard || '—'}</td>
        <td style="${TD}"><span style="color:${rc};font-weight:700">${r.risk || '—'}</span></td>
        <td style="${TD};text-align:left">${r.control || '—'}</td>
      </tr>`;
    }).join('');
    return `<tr><td colspan="2" style="padding:0;border-bottom:1px solid #eee">
      <div style="${CELL_LABEL};border-bottom:1px solid #eee">${labelOf(k)} (${included.length})</div>
      <div style="overflow-x:auto;padding:10px 14px">
        <table style="width:100%;border-collapse:collapse">${thead}${rows}</table>
      </div></td></tr>`;
  }

  // Production table: { blocks: { blockType: { mon,tue,...} }, crew: {...} }
  function renderProductionHtml(k, v) {
    const days = ['mon','tue','wed','thu','fri','sat','sun'];
    const dayLabels = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
    let html = '';
    if (v.blocks) {
      const blockRows = Object.entries(v.blocks).map(([type, dayVals]) => {
        const total = days.reduce((s, d) => s + (parseFloat(dayVals[d]) || 0), 0);
        if (!total) return '';
        const cells = days.map(d => `<td style="${TD}">${dayVals[d] || '—'}</td>`).join('');
        return `<tr><td style="${TD};text-align:left;font-weight:600">${type}</td>${cells}<td style="${TD};font-weight:700">${total}</td></tr>`;
      }).filter(Boolean).join('');
      if (blockRows) {
        const thead = `<tr><th style="${TH};text-align:left">Block</th>${dayLabels.map(d=>`<th style="${TH}">${d}</th>`).join('')}<th style="${TH}">Total</th></tr>`;
        html += `<div style="font-weight:700;font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.04em;padding:4px 0 6px">Block Placement</div>
          <div style="overflow-x:auto;margin-bottom:12px"><table style="width:100%;border-collapse:collapse">${thead}${blockRows}</table></div>`;
      }
    }
    if (v.crew) {
      const crewRows = Object.entries(v.crew).map(([type, dayVals]) => {
        const total = days.reduce((s, d) => s + (parseFloat(dayVals[d]) || 0), 0);
        if (!total) return '';
        const cells = days.map(d => `<td style="${TD}">${dayVals[d] || '—'}</td>`).join('');
        return `<tr><td style="${TD};text-align:left;font-weight:600">${type}</td>${cells}<td style="${TD};font-weight:700">${total}</td></tr>`;
      }).filter(Boolean).join('');
      if (crewRows) {
        const thead = `<tr><th style="${TH};text-align:left">Crew</th>${dayLabels.map(d=>`<th style="${TH}">${d}</th>`).join('')}<th style="${TH}">Total</th></tr>`;
        html += `<div style="font-weight:700;font-size:12px;color:#555;text-transform:uppercase;letter-spacing:.04em;padding:4px 0 6px">Crew Count</div>
          <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">${thead}${crewRows}</table></div>`;
      }
    }
    if (!html) return '';
    return `<tr><td colspan="2" style="padding:0;border-bottom:1px solid #eee">
      <div style="${CELL_LABEL};border-bottom:1px solid #eee">${labelOf(k)}</div>
      <div style="padding:12px 14px">${html}</div></td></tr>`;
  }

  // QAQC: [{result:'pass'|'fail'|'na'|null, comment:''}]
  function renderQaqcHtml(k, v) {
    const pass = v.filter(r => r.result === 'pass').length;
    const fail = v.filter(r => r.result === 'fail').length;
    const na   = v.filter(r => r.result === 'na').length;
    const total = v.length;
    const failItems = v.map((r, i) => r.result === 'fail'
      ? `<div style="font-size:13px;color:#ef4444;padding:2px 0">✗ Item ${i+1}${r.comment ? ` — ${r.comment}` : ''}</div>`
      : '').filter(Boolean).join('');
    const summary = `<span style="color:#10b981;font-weight:700">✓ ${pass} Pass</span>
      &nbsp;&nbsp;<span style="color:#ef4444;font-weight:700">✗ ${fail} Fail</span>
      &nbsp;&nbsp;<span style="color:#888">— ${na} N/A</span>
      &nbsp;&nbsp;<span style="color:#aaa;font-size:12px">(${total} items)</span>`;
    return simpleRow(k, summary + (failItems ? `<div style="margin-top:8px">${failItems}</div>` : ''));
  }

  function renderFieldRow(k, v) {
    if (v === null || v === undefined || v === '') return '';
    if (k.startsWith('_')) return '';                              // section headers
    if (typeof v === 'string' && v.startsWith('data:')) return ''; // base64 sigs

    // Timesheet: [{name, days:{mon:{r,ot},...}}]
    if (Array.isArray(v) && v[0]?.days && typeof v[0].days === 'object')
      return renderTimesheetRows(v);

    // FLRA: [{task, riskLevel, hazards, controls, included}]
    if (Array.isArray(v) && v.length && 'task' in (v[0] || {}))
      return renderFlraRows(v);

    // Toolbox hazard review: [{hazard, risk, control, included}]
    if (Array.isArray(v) && v.length && 'hazard' in (v[0] || {}))
      return renderToolboxHazardsHtml(k, v);

    // Crew sign-in: [{name, sig}]
    if (Array.isArray(v) && v.length && 'sig' in (v[0] || {})) {
      const html = renderCrewSignin(v);
      return html ? simpleRow(k, html) : '';
    }

    // QAQC: [{result, comment}]
    if (Array.isArray(v) && v.length && 'result' in (v[0] || {}))
      return renderQaqcHtml(k, v);

    // Simple array of strings (checkbox-group)
    if (Array.isArray(v)) {
      const str = v.filter(x => x && typeof x !== 'object').join(' • ');
      return str ? simpleRow(k, str) : '';
    }

    if (v && typeof v === 'object') {
      // Production table: {blocks:{...}, crew:{...}}
      if ('blocks' in v || 'crew' in v)
        return renderProductionHtml(k, v);

      // Daily inspection: { sectionName: { itemText: 'ok'|'x'|null } }
      const vals = Object.values(v);
      if (vals.length && vals[0] && typeof vals[0] === 'object' && !Array.isArray(vals[0]))
        return renderDailyInspectionHtml(k);

      // Boolean checklist: {label: boolean}
      if (vals.some(x => typeof x === 'boolean')) {
        const html = renderChecklist(v);
        return html ? simpleRow(k, html) : '';
      }

      return '';
    }

    // Plain string/number
    const str = String(v).trim();
    return str ? simpleRow(k, str.replace(/\n/g, '<br>')) : '';
  }

  const skipKeys = new Set(['signature', 'sig']);
  const fieldRows = Object.entries(parsedFields)
    .filter(([k, v]) => !skipKeys.has(k) && v !== null && v !== undefined && v !== '')
    .map(([k, v]) => renderFieldRow(k, v))
    .join('');

  const typeColors = {
    'Daily Tailgate':    '#f59e0b',
    'Safety Inspection': '#3b82f6',
    'Toolbox Talk':      '#10b981',
    'Incident Report':   '#ef4444',
    'Hazard Observation':'#f97316',
    'Site Photos Only':  '#8b5cf6'
  };
  const accentColor = typeColors[submissionType] || '#f59e0b';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:20px;background:#f0f0f0;font-family:Arial,Helvetica,sans-serif">
<div style="max-width:580px;margin:0 auto;border-radius:12px;overflow:hidden;box-shadow:0 4px 20px rgba(0,0,0,0.15)">

  <!-- Header -->
  <div style="background:#111;padding:28px 24px">
    <div style="background:${accentColor};color:#000;font-weight:800;font-size:22px;
                padding:6px 14px;border-radius:8px;display:inline-block;letter-spacing:-0.5px">TM</div>
    <div style="display:inline-block;margin-left:14px;vertical-align:middle">
      <div style="color:#fff;font-size:18px;font-weight:700">Trademark Masonry</div>
      <div style="color:#888;font-size:13px;margin-top:2px">Safety Management System</div>
    </div>
  </div>

  <!-- Type Badge -->
  <div style="background:${accentColor};padding:12px 24px">
    <span style="font-weight:700;font-size:15px;color:#000">${submissionType.toUpperCase()}</span>
  </div>

  <!-- Core Info -->
  <div style="background:#fff;padding:0">
    <table style="width:100%;border-collapse:collapse">
      <tr>
        <td style="padding:12px 14px;background:#f7f7f7;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #eee;width:38%">Foreman</td>
        <td style="padding:12px 14px;color:#111;font-size:15px;font-weight:600;border-bottom:1px solid #eee">${foremanName}</td>
      </tr>
      <tr>
        <td style="padding:12px 14px;background:#f7f7f7;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #eee">Project</td>
        <td style="padding:12px 14px;color:#111;font-size:14px;border-bottom:1px solid #eee">${project}</td>
      </tr>
      <tr>
        <td style="padding:12px 14px;background:#f7f7f7;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #eee">Date</td>
        <td style="padding:12px 14px;color:#111;font-size:14px;border-bottom:1px solid #eee">${date}</td>
      </tr>
      <tr>
        <td style="padding:12px 14px;background:#f7f7f7;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #eee">Workers on Site</td>
        <td style="padding:12px 14px;color:#111;font-size:14px;border-bottom:1px solid #eee">${workersOnSite || '—'}</td>
      </tr>
      <tr>
        <td style="padding:12px 14px;background:#f7f7f7;font-weight:600;color:#666;font-size:12px;text-transform:uppercase;letter-spacing:0.04em">Photos</td>
        <td style="padding:12px 14px;color:#111;font-size:14px">${photos.length > 0 ? `${photos.length} photo(s) attached` : 'No photos'}</td>
      </tr>
    </table>
  </div>

  ${fieldRows ? `
  <!-- Form Details -->
  <div style="background:#fff;border-top:3px solid ${accentColor};padding:0">
    <div style="padding:14px 24px;background:#f7f7f7;font-size:11px;font-weight:700;
                text-transform:uppercase;letter-spacing:0.06em;color:#888;border-bottom:1px solid #eee">
      Form Details
    </div>
    <table style="width:100%;border-collapse:collapse">${fieldRows}</table>
  </div>` : ''}

  <!-- Footer -->
  <div style="background:#111;padding:16px 24px;text-align:center">
    <p style="color:#666;font-size:12px;margin:0">
      Trademark Masonry Safety Management System &nbsp;•&nbsp;
      PDF report ${pdfBuffer ? 'attached' : 'not generated'}
    </p>
  </div>

</div>
</body>
</html>`;

  const attachments = [];

  if (pdfBuffer) {
    attachments.push({
      filename: pdfName,
      content: Buffer.from(pdfBuffer).toString('base64'),
    });
  }

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const ext = (photo.originalname || 'photo.jpg').split('.').pop().toLowerCase();
    const safeName = pdfName.replace('.pdf', '') + `_photo${String(i + 1).padStart(2, '0')}.${ext}`;
    attachments.push({
      filename: safeName,
      content: photo.buffer.toString('base64'),
    });
  }

  const resend = getResend();
  const result = await resend.emails.send({
    from: 'Trademark Safety <onboarding@resend.dev>',
    to: [recipient],
    subject: `[Safety] ${submissionType} — ${project} — ${date}`,
    html,
    attachments
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend API error');
  }

  return { recipient, filesAttached: attachments.length };
}

async function sendCSOEmail({ csoEmail, csoName, foremanName, project, submissionType, date, pdfBuffer, pdfName }) {
  const greeting = csoName ? `Hi ${csoName},` : 'Hi,';
  const formLabel = submissionType || 'Safety Form';

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  body{margin:0;padding:0;background:#f4f6f8;font-family:Arial,sans-serif}
  .wrap{max-width:600px;margin:32px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)}
  .header{background:#1a2e4a;padding:28px 32px}
  .header h1{margin:0;color:#fff;font-size:20px;font-weight:700}
  .header p{margin:6px 0 0;color:#a8c4e0;font-size:13px}
  .badge{display:inline-block;background:#e8f0fe;color:#1a2e4a;font-size:12px;font-weight:700;padding:4px 12px;border-radius:20px;margin-top:10px}
  .body{padding:32px;color:#333;font-size:15px;line-height:1.6}
  .body p{margin:0 0 16px}
  .details{background:#f8f9fb;border-radius:6px;padding:16px 20px;margin:20px 0}
  .details table{width:100%;border-collapse:collapse}
  .details td{padding:5px 0;font-size:14px;color:#555}
  .details td:first-child{font-weight:700;color:#333;width:100px}
  .footer{background:#f4f6f8;padding:16px 32px;text-align:center;font-size:12px;color:#999}
</style>
</head>
<body>
<div class="wrap">
  <div class="header">
    <h1>Trademark Masonry</h1>
    <p>Safety Documentation</p>
    <span class="badge">${formLabel}</span>
  </div>
  <div class="body">
    <p>${greeting}</p>
    <p>Please see attached the <strong>Trademark Masonry ${formLabel}</strong> for <strong>${date}</strong>.</p>
    <div class="details">
      <table>
        <tr><td>Project</td><td>${project}</td></tr>
        <tr><td>Foreman</td><td>${foremanName}</td></tr>
        <tr><td>Date</td><td>${date}</td></tr>
      </table>
    </div>
    <p>If you have any questions do not hesitate to contact us.</p>
    <p>Regards,<br><strong>Trademark Team</strong></p>
  </div>
  <div class="footer">Trademark Masonry &mdash; Safety Documentation System</div>
</div>
</body></html>`;

  const attachments = [];
  if (pdfBuffer) {
    attachments.push({
      filename: pdfName,
      content: Buffer.from(pdfBuffer).toString('base64'),
    });
  }

  const BREVO_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_KEY) throw new Error('BREVO_API_KEY not set');

  const payload = {
    sender: { name: 'Trademark Safety', email: process.env.EMAIL_USER || 'safetytrademark@gmail.com' },
    to: [{ email: csoEmail, name: csoName || csoEmail }],
    subject: `Safety Form – ${formLabel} – ${project} (${date})`,
    htmlContent: html,
    attachment: attachments.map(a => ({ content: a.content, name: a.filename })),
  };

  const res = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: { 'api-key': BREVO_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Brevo error: ${err}`);
  }
}

async function testConnection() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not set');
  }
}

module.exports = { sendSafetySubmission, sendCSOEmail, testConnection };
