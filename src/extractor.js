/**
 * Uses the Claude API to extract commitments and action items from email text.
 */

import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from env

const SYSTEM_PROMPT = `You are an executive assistant analyzing sent emails to extract commitments, promises, and action items that the sender (your boss) made.

You will also be given a list of EXISTING TASKS. Use these to avoid duplicates:
- If an email commitment matches an existing task, decide whether the existing task needs updating (e.g., new due date, more context in notes, clearer title). If so, return an "update" action referencing the existing task's ID.
- If an existing task already covers the commitment and nothing has changed, return action "none" for it.
- Only return action "create" for genuinely new commitments not covered by existing tasks.

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
      "action": "create" | "update" | "none",
      "existingTaskId": "only for update/none — the ID of the matched existing task",
      "title": "Short actionable task description",
      "notes": "Context from the email (who it's for, what was discussed)",
      "dueDate": "YYYY-MM-DD"
    }
  ]
}`;

/**
 * @param {object} email - { subject, to, date, body }
 * @param {Array<{id: string, title: string, notes: string, dueDate: string}>} existingTasks
 * @param {string} model - Claude model to use
 * @returns {Promise<Array<{action: string, existingTaskId?: string, title: string, notes: string, dueDate: string}>>}
 */
export async function extractCommitments(email, existingTasks = [], model = 'claude-sonnet-4-20250514') {
  let existingTasksBlock = '';
  if (existingTasks.length > 0) {
    const taskList = existingTasks.map(t =>
      `- ID: ${t.id} | Title: "${t.title}" | Due: ${t.dueDate || 'none'} | Notes: ${t.notes || 'none'}`
    ).join('\n');
    existingTasksBlock = `\n\nEXISTING TASKS:\n${taskList}`;
  } else {
    existingTasksBlock = '\n\nEXISTING TASKS: (none)';
  }

  const userMessage = `Analyze this sent email for commitments I made:

To: ${email.to}
Subject: ${email.subject}
Date: ${email.date}

---
${email.body}
---

Today's date: ${new Date().toISOString().split('T')[0]}${existingTasksBlock}

Extract any commitments or action items I made in this email. If a commitment matches an existing task, use action "update" (with the existing task's ID) if details changed, or "none" if nothing needs updating. Use action "create" only for new commitments.`;

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
