/**
 * Lead Monitor — polls Gmail for incoming emails from configured sender
 * addresses/domains, classifies them with Claude, and alerts via Sonos.
 *
 * Usage:  node src/leadMonitor.js
 */

import 'dotenv/config';
import { google } from 'googleapis';
import { getAuthClient } from './googleClient.js';
import { classifyLead } from './leadClassifier.js';
import { alertLead } from './sonos.js';

// --- Config ---

// Sender addresses and domains to watch (from .env, comma-separated)
const WATCH_SENDERS = (process.env.WATCH_SENDERS || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

const POLL_INTERVAL_SEC = parseInt(process.env.POLL_INTERVAL_SEC || '120', 10);
const LEAD_URGENCY_THRESHOLD = parseInt(process.env.LEAD_URGENCY_THRESHOLD || '3', 10);
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001';
const DRY_RUN = process.env.DRY_RUN === 'true';

// Track message IDs we've already processed so we don't re-alert
const processedIds = new Set();

/**
 * Build a Gmail query string that matches any of the watched senders.
 * Supports full email addresses (from:user@domain.com) and domains (from:@domain.com).
 * @param {number} afterTimestamp - Unix timestamp (seconds)
 */
function buildQuery(afterTimestamp) {
  if (WATCH_SENDERS.length === 0) {
    throw new Error('WATCH_SENDERS is empty — set it in .env (comma-separated emails/domains)');
  }

  const fromClauses = WATCH_SENDERS.map(sender => {
    // If it contains @, use as-is; if it's a bare domain, prefix @
    if (sender.includes('@')) {
      return `from:${sender}`;
    }
    return `from:@${sender}`;
  });

  // Gmail supports OR for combining from clauses
  const fromFilter = fromClauses.length === 1
    ? fromClauses[0]
    : `{${fromClauses.join(' ')}}`;

  return `${fromFilter} in:inbox after:${afterTimestamp}`;
}

/**
 * Recursively extract plain-text body from a Gmail message payload.
 */
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

/**
 * Fetch and return new emails from watched senders since `afterTimestamp`.
 */
async function fetchWatchedEmails(auth, afterTimestamp) {
  const gmail = google.gmail({ version: 'v1', auth });
  const query = buildQuery(afterTimestamp);

  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 50,
  });

  const messages = (listRes.data.messages || []).filter(m => !processedIds.has(m.id));

  if (messages.length === 0) return [];

  const emails = [];
  for (let i = 0; i < messages.length; i += 10) {
    const batch = messages.slice(i, i + 10);
    const details = await Promise.all(
      batch.map(m =>
        gmail.users.messages.get({ userId: 'me', id: m.id, format: 'full' })
      )
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
        inReplyTo: getHeader('In-Reply-To'),
        body: extractBody(msg.payload).slice(0, 10_000),
      });
    }
  }

  return emails;
}

/**
 * Process a single email: classify → alert if it's a lead.
 */
async function processEmail(email) {
  processedIds.add(email.id);

  // Skip replies — only alert on initial/new emails
  if (email.inReplyTo) {
    console.log(`\n📨 Reply from: ${email.from}`);
    console.log(`   Subject: ${email.subject}`);
    console.log(`   ↩️  Skipping reply (In-Reply-To header present)`);
    return { alerted: false, result: null };
  }

  console.log(`\n📨 New email from: ${email.from}`);
  console.log(`   Subject: ${email.subject}`);

  const result = await classifyLead(email, CLAUDE_MODEL);

  console.log(`   Classification: ${result.isLead ? '🔥 LEAD' : '📭 Not a lead'} (urgency: ${result.urgency}/5)`);
  console.log(`   Reason: ${result.reason}`);

  if (result.isLead && result.urgency >= LEAD_URGENCY_THRESHOLD) {
    console.log(`   🚨 Urgency ${result.urgency} >= threshold ${LEAD_URGENCY_THRESHOLD} — ALERTING!`);

    if (DRY_RUN) {
      console.log(`   ⚠️  DRY RUN — would announce: "${result.summary}"`);
    } else {
      await alertLead(result);
    }

    return { alerted: true, result };
  }

  console.log(`   Skipping alert (urgency below threshold or not a lead)`);
  return { alerted: false, result };
}

/**
 * Main polling loop.
 */
async function main() {
  console.log('\n🔍 Lead Monitor Starting...\n');
  console.log(`   Watching senders: ${WATCH_SENDERS.join(', ')}`);
  console.log(`   Poll interval: ${POLL_INTERVAL_SEC}s`);
  console.log(`   Urgency threshold: ${LEAD_URGENCY_THRESHOLD}`);
  console.log(`   Claude model: ${CLAUDE_MODEL}`);
  if (DRY_RUN) console.log('   ⚠️  DRY RUN mode — no Sonos alerts will be played');
  console.log('');

  // Authenticate once
  console.log('🔑 Authenticating with Google...');
  const auth = await getAuthClient();
  console.log('   Authenticated ✓\n');

  // Start polling from NOW (don't alert on old emails)
  let lastCheckTimestamp = Math.floor(Date.now() / 1000);
  let totalAlerts = 0;
  let totalChecks = 0;

  console.log(`⏳ Polling every ${POLL_INTERVAL_SEC}s — press Ctrl+C to stop\n`);
  console.log('─'.repeat(50));

  // Run first check immediately, then on interval
  async function poll() {
    totalChecks++;
    const now = new Date().toLocaleTimeString();
    process.stdout.write(`\r🔄 [${now}] Check #${totalChecks}...`);

    try {
      const emails = await fetchWatchedEmails(auth, lastCheckTimestamp);

      if (emails.length > 0) {
        console.log(`\n   📬 ${emails.length} new email(s) from watched senders!`);

        for (const email of emails) {
          const { alerted } = await processEmail(email);
          if (alerted) totalAlerts++;
        }

        console.log('─'.repeat(50));
      }

      // Move the window forward (with 30s overlap to avoid race conditions)
      lastCheckTimestamp = Math.floor(Date.now() / 1000) - 30;
    } catch (err) {
      console.error(`\n   ⚠️  Poll error: ${err.message}`);
    }
  }

  // First poll
  await poll();

  // Then keep polling
  const intervalId = setInterval(poll, POLL_INTERVAL_SEC * 1000);

  // Graceful shutdown
  process.on('SIGINT', () => {
    clearInterval(intervalId);
    console.log(`\n\n👋 Lead Monitor stopped. Total alerts: ${totalAlerts} across ${totalChecks} checks.\n`);
    process.exit(0);
  });
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
