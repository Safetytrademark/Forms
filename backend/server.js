require('dotenv').config();
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const { sendSafetySubmission, sendCSOEmail, testConnection } = require('./mailer');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS
const allowedOrigins = (process.env.CORS_ORIGINS || '*').split(',').map(o => o.trim());
app.use(cors({
  origin: allowedOrigins.includes('*') ? '*' : (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error('Not allowed by CORS'));
  }
}));

// Multer: memory storage, max 20MB per file, 15 photos
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024, files: 16 }
});

app.get('/health', (req, res) => {
  res.json({ status: 'ok', version: '2.0.0', service: 'Trademark Safety Backend (Email)' });
});

app.post('/submit', upload.fields([
  { name: 'pdf', maxCount: 1 },
  { name: 'photos', maxCount: 15 }
]), async (req, res) => {
  try {
    const { project, submissionType, foremanName, date, workersOnSite, formFields, csoEmail, csoName } = req.body;

    if (!project || !submissionType || !foremanName || !date) {
      return res.status(400).json({ error: 'Missing required fields: project, submissionType, foremanName, date' });
    }

    const pdfFile = req.files?.pdf?.[0];
    const photos = req.files?.photos || [];

    // Build PDF filename
    const safeDate = date.replace(/-/g, '');
    const safeProject = project.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').substring(0, 30);
    const safeType = submissionType.replace(/\s+/g, '_');
    const now = new Date();
    const hhmm = String(now.getHours()).padStart(2, '0') + String(now.getMinutes()).padStart(2, '0');
    const pdfName = `${safeType}_${safeProject}_${safeDate}_${hhmm}.pdf`;

    await sendSafetySubmission({
      foremanName,
      project,
      submissionType,
      date,
      workersOnSite,
      fields: formFields,
      pdfBuffer: pdfFile?.buffer || null,
      pdfName,
      photos
    });

    console.log(`✓ [${new Date().toISOString()}] Email sent`);
    console.log(`  ${foremanName} | ${project} | ${submissionType} | ${photos.length} photo(s)`);

    // Fire-and-forget CSO email (does not block the response)
    if (csoEmail) {
      sendCSOEmail({
        csoEmail,
        csoName: csoName || '',
        foremanName,
        project,
        submissionType,
        date,
        pdfBuffer: pdfFile?.buffer || null,
        pdfName
      })
        .then(() => console.log(`✓ CSO email sent to ${csoEmail}`))
        .catch(err => console.warn(`⚠ CSO email failed: ${err.message}`));
    }

    res.json({
      success: true,
      message: `Submission emailed to ${process.env.EMAIL_TO || process.env.EMAIL_USER}`,
      filesAttached: (pdfFile ? 1 : 0) + photos.length
    });

  } catch (err) {
    console.error('Submit error:', err.message);

    // Give user-friendly error messages
    let userMsg = err.message;
    if (err.message.includes('Invalid login') || err.message.includes('535')) {
      userMsg = 'Email login failed. Check EMAIL_USER and EMAIL_PASS in .env';
    } else if (err.message.includes('ECONNREFUSED') || err.message.includes('ETIMEDOUT')) {
      userMsg = 'Cannot connect to email server. Check your internet connection.';
    }

    res.status(500).json({ error: 'Failed to send email', details: userMsg });
  }
});

app.listen(PORT, async () => {
  console.log('╔══════════════════════════════════════════╗');
  console.log('║   Trademark Safety App — Email Backend   ║');
  console.log(`║   Running on http://localhost:${PORT}       ║`);
  console.log('╚══════════════════════════════════════════╝\n');

  const { RESEND_API_KEY, EMAIL_TO } = process.env;

  if (!RESEND_API_KEY) {
    console.warn('⚠️  WARNING: RESEND_API_KEY not configured in .env');
    console.warn('   See setup/SETUP.md for instructions.\n');
    return;
  }

  console.log(`✓ Email service : Resend API`);
  console.log(`✓ Sending to    : ${EMAIL_TO || 'safetyinfo@trademarkmasonry.ca'}`);
  console.log('✓ Ready to receive submissions!\n');
});
