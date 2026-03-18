/**
 * Uses the Claude API to extract commitments and action items from email text.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You are an executive assistant analyzing sent emails to extract commitments, promises, and action items that the sender (your boss) made.

Rules:
- Only extract things the SENDER committed to doing (not things they asked others to do)
- Do NOT create tasks for things where the ball is in the OTHER person's court. If the sender proposed options, offered dates, asked a question, or is waiting for a reply — that is NOT a task. The other person will respond or they won't.
- Do NOT create "confirm" or "follow up on response" tasks for emails where the sender made an offer and is waiting to hear back.
- Only create tasks where the sender has a concrete action to take regardless of whether the other person responds (e.g., "I'll send the contract", "I'll edit those photos by Friday", "Let me put together a quote")
- Look for phrases like "I'll", "I will", "I can", "let me", "I'll send", "I'll get back to you", "I'll look into", "I'll schedule", "let me check", "I promised", etc.
- For each task, estimate a reasonable due date based on context. If no date is implied, use 3 days from now.
- Be concise — task titles should be actionable and under 100 characters
- If there are NO commitments in the email, return an empty array

Respond with ONLY valid JSON, no markdown fences. Use this exact schema:
{
  "tasks": [
    {
      "title": "Short actionable task description",
      "notes": "Context from the email (who it's for, what was discussed)",
      "dueDate": "YYYY-MM-DD"
    }
  ]
}`;

/**
 * @param {object} email - { subject, to, date, body }
 * @param {string} model - Claude model to use
 * @returns {Promise<Array<{title: string, notes: string, dueDate: string}>>}
 */
export async function extractCommitments(email, model = 'claude-sonnet-4-20250514') {
  const userMessage = `Analyze this sent email for commitments I made:

To: ${email.to}
Subject: ${email.subject}
Date: ${email.date}

---
${email.body}
---

Today's date: ${new Date().toISOString().split('T')[0]}

Extract any commitments or action items I made in this email.`;

  try {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    });

    const text = response.content[0]?.text || '{"tasks": []}';

    // Parse JSON (strip markdown fences if Claude adds them despite instructions)
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
    const parsed = JSON.parse(cleaned);

    return parsed.tasks || [];
  } catch (err) {
    console.error(`   ⚠️  Claude extraction failed for "${email.subject}":`, err.message);
    return [];
  }
}
