/**
 * Parses Showit contact-form inquiry emails using Claude.
 *
 * Returns structured JSON ready to map into a HoneyBook project.
 *
 * Usage:
 *   POST /api/showit/parse   { "email_body": "...", "email_subject": "..." }
 *   → { client_name, partner_name, email, phone, event_date, event_type, venue, guest_count, ... }
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You are a parser for photography inquiry emails sent by Showit form notifications.

The email body contains labeled fields in this format — a label on one line, the value on the next:
  Date:
  8/1/26
  Venue:
  Aster house
  Name:
  Alie Schirmers
  Partner Name:
  Paul Mcgrath
  ...and so on.

The email may also include a Gmail footer (from: / to: / date: / subject: lines) — ignore that section entirely.

Extract the fields and return ONLY valid JSON — no markdown fences, no explanation.

Use this exact schema (use null for any field not found):
{
  "client_name": "First Last",
  "partner_name": "First Last or null",
  "email": "client@example.com",
  "phone": "digits as provided, or null",
  "event_date": "YYYY-MM-DD or null",
  "event_type": "wedding | engagement | elopement | portrait | other",
  "venue": "venue name, or null",
  "location": "city, state or null",
  "guest_count": "number or range as stated, or null",
  "package_interest": "brief description of what they want, or null",
  "budget": "stated budget or null",
  "referral_source": "value of the Referral field, or null",
  "submitted_from": "URL from Submitted From field, or null",
  "notes": "full text of their Message field, preserved as-is"
}

Rules:
- "Date" in the form = the event date. Normalize to YYYY-MM-DD. Two-digit years: 26 → 2026.
- M/D/YY and M/D/YYYY are both valid inputs (e.g. 8/1/26 → 2026-08-01).
- If only month/year is given, use the 1st of that month.
- Infer event_type from venue name, partner name presence, and message content if not explicit.
- Extract guest_count from the Message if mentioned (e.g. "50-60 person wedding").
- Preserve the Message field verbatim in notes — do not summarize it.
- phone: keep the raw digits/formatting as provided, do not reformat.`;

/**
 * @param {string} emailBody     - Raw email text from the Showit form notification
 * @param {string} [emailSubject] - Optional subject line for additional context
 * @param {string} [model]        - Claude model to use
 * @returns {Promise<object>} Structured inquiry fields (see SYSTEM_PROMPT schema)
 */
export async function parseShowitInquiry(
  emailBody,
  emailSubject = '',
  model = 'claude-haiku-4-5-20251001',
) {
  const userMessage = `Parse this photography inquiry form submission email and return the structured JSON.${emailSubject ? `\n\nSubject: ${emailSubject}` : ''}

---
${emailBody.slice(0, 8_000)}
---`;

  const response = await client.messages.create({
    model,
    max_tokens: 512,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userMessage }],
  });

  const text = response.content[0]?.text || '{}';

  // Strip markdown fences if Claude adds them despite the instructions
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  return JSON.parse(cleaned);
}
