/**
 * Fetches sent emails from Gmail within a time window.
 */

import { google } from 'googleapis';

/**
 * @param {import('googleapis').Auth.OAuth2Client} auth
 * @param {number} hoursBack - How many hours back to look
 * @returns {Promise<Array<{id: string, subject: string, to: string, date: string, body: string}>>}
 */
export async function fetchSentEmails(auth, hoursBack = 24) {
  const gmail = google.gmail({ version: 'v1', auth });

  const after = Math.floor((Date.now() - hoursBack * 60 * 60 * 1000) / 1000);
  const query = `in:sent after:${after}`;

  console.log(`📧 Searching sent emails (last ${hoursBack}h)...`);

  // List message IDs matching query
  const listRes = await gmail.users.messages.list({
    userId: 'me',
    q: query,
    maxResults: 100,
  });

  const messages = listRes.data.messages || [];
  console.log(`   Found ${messages.length} sent email(s)`);

  if (messages.length === 0) return [];

  // Fetch full message details in parallel (batches of 10)
  const emails = [];
  for (let i = 0; i < messages.length; i += 10) {
    const batch = messages.slice(i, i + 10);
    const details = await Promise.all(
      batch.map(m =>
        gmail.users.messages.get({
          userId: 'me',
          id: m.id,
          format: 'full',
        })
      )
    );

    for (const res of details) {
      const msg = res.data;
      const headers = msg.payload?.headers || [];

      const getHeader = name =>
        headers.find(h => h.name.toLowerCase() === name.toLowerCase())?.value || '';

      const body = extractBody(msg.payload);

      emails.push({
        id: msg.id,
        subject: getHeader('Subject'),
        to: getHeader('To'),
        date: getHeader('Date'),
        body: body.slice(0, 10_000), // Cap at 10k chars to control token usage
      });
    }
  }

  return emails;
}

/**
 * Recursively extract plain-text body from a Gmail message payload.
 */
function extractBody(payload) {
  if (!payload) return '';

  // Direct body data
  if (payload.mimeType === 'text/plain' && payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  // Multipart — recurse into parts
  if (payload.parts) {
    // Prefer text/plain
    for (const part of payload.parts) {
      if (part.mimeType === 'text/plain' && part.body?.data) {
        return Buffer.from(part.body.data, 'base64url').toString('utf-8');
      }
    }
    // Fall back to first part with data, or recurse
    for (const part of payload.parts) {
      const result = extractBody(part);
      if (result) return result;
    }
  }

  // Last resort: decode whatever body data exists
  if (payload.body?.data) {
    return Buffer.from(payload.body.data, 'base64url').toString('utf-8');
  }

  return '';
}
