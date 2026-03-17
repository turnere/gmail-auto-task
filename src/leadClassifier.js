/**
 * Uses Claude to classify incoming emails as leads requiring a fast response.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic();

const SYSTEM_PROMPT = `You are a lead qualification assistant for a wedding photography business. You analyze incoming emails/notifications from wedding platforms (Zola, The Knot, WeddingWire, Showit) to determine if this is a new lead or inquiry that requires a fast response.

Rules:
- Identify if this is a NEW inquiry, lead, or message from a potential client
- Distinguish between marketing emails, newsletters, and actual leads
- Marketing, promotional, digest, or summary emails are NOT leads
- A new message from a couple asking about availability, pricing, or booking IS a lead
- Contact form submissions from your website (Showit) ARE leads
- Rate urgency from 1-5:
  1 = Not a lead (marketing, newsletter, transactional)
  2 = Low priority (general info, no action needed)
  3 = Moderate (follow-up on existing conversation)
  4 = High (new inquiry needing response today)
  5 = Critical (time-sensitive booking, same-day wedding date, competitive situation)

Respond with ONLY valid JSON, no markdown fences:
{
  "isLead": true/false,
  "urgency": 1-5,
  "summary": "One-line summary of the lead/email",
  "senderName": "Name of the person reaching out (if available, else null)",
  "platform": "Zola/TheKnot/WeddingWire/Showit/Unknown",
  "reason": "Brief reason for your classification"
}`;

/**
 * Classify an incoming email as a lead or not.
 * @param {object} email - { subject, from, date, body }
 * @param {string} model - Claude model to use
 * @returns {Promise<{isLead: boolean, urgency: number, summary: string, senderName: string|null, platform: string, reason: string}>}
 */
export async function classifyLead(email, model = 'claude-haiku-4-5-20251001') {
  const userMessage = `Analyze this incoming email and determine if it's a lead I need to respond to:

From: ${email.from}
Subject: ${email.subject}
Date: ${email.date}

---
${email.body}
---

Is this a lead requiring a response?`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0]?.text || '{}';
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    return JSON.parse(cleaned);
  } catch (err) {
    console.error(`   ⚠️  Lead classification failed for "${email.subject}":`, err.message);
    return { isLead: false, urgency: 1, summary: 'Classification failed', senderName: null, platform: 'Unknown', reason: err.message };
  }
}
