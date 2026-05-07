/**
 * Showit Inquiry Monitor
 *
 * Polls Gmail for contact-form notification emails from Showit, parses them
 * with Claude to produce clean structured data, then fires a Zapier Catch Hook
 * so Zapier can create the HoneyBook project without touching the raw email at all.
 *
 * Required env vars:
 *   SHOWIT_HOOK_URL          — your Make.com (or any) webhook URL
 *   ANTHROPIC_API_KEY        — already used by other modules
 *
 * Optional env vars:
 *   SHOWIT_SENDER            — sender to watch (default: noreply@showit.co)
 *   SHOWIT_POLL_SEC          — poll interval in seconds (default: 120)
 *   SHOWIT_SOURCE_LABEL      — value to hardcode as lead_source (default: "showit-website")
 *   DRY_RUN=true             — parse and log but don't POST to Zapier
 *
 * Usage:  node src/showitMonitor.js
 *         npm run showit
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { getAuthClient } from './googleClient.js';
import { parseShowitInquiry } from './showit.js';
import { appendInquiryRow, ensureHeaders } from './sheets.js';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SHOWIT_SENDER     = process.env.SHOWIT_SENDER || 'noreply@showit.co';
const POLL_INTERVAL_SEC = parseInt(process.env.SHOWIT_POLL_SEC || '120', 10);
const SOURCE_LABEL      = process.env.SHOWIT_SOURCE_LABEL || 'showit-website';
const CLAUDE_MODEL      = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const DRY_RUN           = process.env.DRY_RUN === 'true';

if (!process.env.SHOWIT_SHEET_ID && !DRY_RUN) {
  console.error('❌ SHOWIT_SHEET_ID is required. Set it in .env or run with DRY_RUN=true.');
  process.exit(1);
}

// Track message IDs processed this session to avoid double-firing
const processedIds = new Set();

// ---------------------------------------------------------------------------
// Gmail helpers
// ---------------------------------------------------------------------------

function buildQuery(afterTimestamp) {
  return `from:${SHOWIT_SENDER} in:inbox after:${afterTimestamp}`;
}

function extractBody(payload) {
  if (!payload) return '';
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  if (payload.parts) {
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf-8');
      }
    }
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }
  return '';
}

async function fetchShowitEmails(auth, afterTimestamp) {
  const gmail = google.gmail({ version: 'v1', auth });

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: buildQuery(afterTimestamp),
    maxResults: 20,
  });

  const messages = (listRes.data.messages || []).filter(m => !processedIds.has(m.id));
  if (messages.length === 0) return [];

  const emails = [];
  for (let i = 0; i < messages.length; i += 10) {
    const batch = messages.slice(i, i + 10);
    const details = await Promise.all(
      batch.map(m => gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' }))
    );
    for (const res of details) {
      const msg = res.data;
      const headers = msg.payload?.headers || [];
      const getHeader = name =>
        headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';
      emails.push({
        id: msg.id,
        subject: getHeader('Subject'),
        from: getHeader('From'),
        date: getHeader('Date'),
        body: extractBody(msg.payload).slice(0, 10_000),
      });
    }
  }
  return emails;
}

// ---------------------------------------------------------------------------
// Process one email
// ---------------------------------------------------------------------------

async function processEmail(auth, email) {
  processedIds.add(email.id);

  console.log(`\n📨  ${email.subject}`);
  console.log(`    From: ${email.from}  |  ${email.date}`);

  // Parse with Claude
  let inquiry;
  try {
    inquiry = await parseShowitInquiry(email.body, email.subject, CLAUDE_MODEL);
  } catch (err) {
    console.error(`    ❌ Claude parse failed: ${err.message}`);
    return;
  }

  // Stamp with a standard source and the raw email metadata
  const payload = {
    ...inquiry,
    lead_source:    SOURCE_LABEL,
    received_at:    email.date,
    gmail_subject:  email.subject,
  };

  console.log(`    ✅ Parsed: ${inquiry.client_name} (${inquiry.email})`);
  console.log(`       Event: ${inquiry.event_type} on ${inquiry.event_date} @ ${inquiry.venue}`);
  console.log(`       Referral: ${inquiry.referral_source}  |  Guests: ${inquiry.guest_count}`);

  if (DRY_RUN) {
    console.log('    ⚠️  DRY RUN — row that would be written to sheet:');
    console.log(JSON.stringify(payload, null, 6).replace(/^/gm, '    '));
    return;
  }

  try {
    await appendInquiryRow(auth, payload);
    console.log('    📊 Row appended to Google Sheet → Zapier will trigger');
  } catch (err) {
    console.error(`    ❌ Sheet write failed: ${err.message}`);
  }
}

// ---------------------------------------------------------------------------
// Main polling loop
// ---------------------------------------------------------------------------

async function main() {
  console.log('\n📸 Showit Inquiry Monitor Starting...\n');
  console.log(`   Watching sender : ${SHOWIT_SENDER}`);
  console.log(`   Poll interval   : ${POLL_INTERVAL_SEC}s`);
  console.log(`   Lead source tag : ${SOURCE_LABEL}`);
  console.log(`   Claude model    : ${CLAUDE_MODEL}`);
  console.log(`   Sheet ID        : ${DRY_RUN ? '(dry run)' : process.env.SHOWIT_SHEET_ID}`);
  if (DRY_RUN) console.log('\n   ⚠️  DRY RUN — no sheet writes will be made');
  console.log('');

  console.log('🔑 Authenticating with Google...');
  const auth = await getAuthClient();
  console.log('   Authenticated ✓\n');

  // Ensure the sheet has a header row before any rows are appended
  if (!DRY_RUN) await ensureHeaders(auth);

  // Start window from NOW — don't reprocess old emails on startup
  let lastCheckTimestamp = Math.floor(Date.now() / 1000);
  let totalFired = 0;
  let totalChecks = 0;

  console.log(`⏳ Polling every ${POLL_INTERVAL_SEC}s — press Ctrl+C to stop\n`);
  console.log('─'.repeat(55));

  async function poll() {
    totalChecks++;
    const now = new Date().toLocaleTimeString();
    process.stdout.write(`\r🔄 [${now}] Check #${totalChecks}...`);

    try {
      const emails = await fetchShowitEmails(auth, lastCheckTimestamp);

      if (emails.length > 0) {
        console.log(`\n   📬 ${emails.length} new Showit inquiry email(s)!`);
        for (const email of emails) {
          await processEmail(auth, email);
          totalFired++;
        }
        console.log('\n' + '─'.repeat(55));
      }

      // Slide window forward (30s overlap avoids race conditions)
      lastCheckTimestamp = Math.floor(Date.now() / 1000) - 30;
    } catch (err) {
      console.error(`\n   ⚠️  Poll error: ${err.message}`);
    }
  }

  await poll();
  const intervalId = setInterval(poll, POLL_INTERVAL_SEC * 1000);

  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log(`\n\n👋 Showit Monitor stopped. Inquiries sent to Zapier: ${totalFired} over ${totalChecks} checks.\n`);
    process.exit(0);
  });
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
