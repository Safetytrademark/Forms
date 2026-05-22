const { Resend } = require('resend');

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

async function sendSafetySubmission({ foremanName, project, submissionType, date, workersOnSite, fields, pdfBuffer, pdfName, photos }) {
  const recipient = process.env.EMAIL_TO || 'safetyinfo@trademarkmasonry.ca';

  const parsedFields = typeof fields === 'string' ? JSON.parse(fields) : (fields || {});

  const fieldRows = Object.entries(parsedFields)
    .filter(([, v]) => v && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== ''))
    .map(([k, v]) => {
      const label = k.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const value = Array.isArray(v) ? v.join(' • ') : String(v);
      return `
        <tr>
          <td style="padding:10px 14px;background:#fafafa;font-weight:600;color:#666;
                     font-size:12px;text-transform:uppercase;letter-spacing:0.04em;
                     border-bottom:1px solid #eee;width:38%;vertical-align:top">${label}</td>
          <td style="padding:10px 14px;color:#222;font-size:14px;
                     border-bottom:1px solid #eee;line-height:1.5">${value}</td>
        </tr>`;
    }).join('');

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

  const resend = getResend();
  const result = await resend.emails.send({
    from: 'Trademark Safety <onboarding@resend.dev>',
    to: [csoEmail],
    subject: `Safety Form – ${formLabel} – ${project} (${date})`,
    html,
    attachments,
  });

  if (result.error) {
    throw new Error(result.error.message || 'Resend API error');
  }

  return result;
}

async function testConnection() {
  if (!process.env.RESEND_API_KEY) {
    throw new Error('RESEND_API_KEY not set');
  }
}

module.exports = { sendSafetySubmission, sendCSOEmail, testConnection };
