/**
 * Creates todos with reminders in Habitica from extracted commitments.
 * 
 * Habitica API docs: https://habitica.com/apidoc/
 * Get your User ID and API Token from: Habitica → Settings → API
 */

const HABITICA_BASE = 'https://habitica.com/api/v3';

const TAG_NAME = process.env.HABITICA_TAG || 'Photography';

// Cache the tag ID after first lookup
let cachedTagId = null;

function getHeaders() {
  const userId = process.env.HABITICA_USER_ID;
  const apiToken = process.env.HABITICA_API_TOKEN;

  if (!userId || !apiToken) {
    throw new Error(
      'Missing HABITICA_USER_ID or HABITICA_API_TOKEN in .env\n' +
      'Get these from: Habitica → Settings → API'
    );
  }

  return {
    'Content-Type': 'application/json',
    'x-api-user': userId,
    'x-api-key': apiToken,
    'x-client': 'gmail-auto-task',
  };
}

/**
 * Get or create a Habitica tag by name.
 * @returns {Promise<string>} tag ID
 */
async function getOrCreateTag() {
  if (cachedTagId) return cachedTagId;

  // List existing tags
  const listRes = await fetch(`${HABITICA_BASE}/tags`, {
    headers: getHeaders(),
  });

  if (listRes.ok) {
    const { data: tags } = await listRes.json();
    const existing = tags.find(t => t.name.toLowerCase() === TAG_NAME.toLowerCase());
    if (existing) {
      cachedTagId = existing.id;
      console.log(`   🏷️  Using existing tag: "${TAG_NAME}"`);
      return cachedTagId;
    }
  }

  // Create the tag if it doesn't exist
  const createRes = await fetch(`${HABITICA_BASE}/tags`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({ name: TAG_NAME }),
  });

  if (!createRes.ok) {
    console.warn(`   ⚠️  Could not create tag "${TAG_NAME}" — tasks will be untagged`);
    return null;
  }

  const { data: newTag } = await createRes.json();
  cachedTagId = newTag.id;
  console.log(`   🏷️  Created new tag: "${TAG_NAME}"`);
  return cachedTagId;
}

/**
 * Create a single Habitica todo with an optional reminder.
 * 
 * @param {object} task - { title, notes, dueDate }
 * @returns {Promise<object>} created task data
 */
export async function createHabiticaTask(task) {
  const body = {
    type: 'todo',
    text: task.title,
    notes: task.notes || '',
    priority: 1.5, // Medium priority (0.1=trivial, 1=easy, 1.5=medium, 2=hard)
  };

  // Add tag
  const tagId = await getOrCreateTag();
  if (tagId) {
    body.tags = [tagId];
  }

  // Add due date if provided
  if (task.dueDate) {
    body.date = task.dueDate; // YYYY-MM-DD format
  }

  // Add a reminder for the morning of the due date (or tomorrow if no date)
  const reminderDate = task.dueDate
    ? new Date(task.dueDate + 'T09:00:00')
    : new Date(Date.now() + 24 * 60 * 60 * 1000); // tomorrow

  reminderDate.setHours(9, 0, 0, 0); // 9 AM

  body.reminders = [
    {
      startDate: reminderDate.toISOString(),
      time: reminderDate.toISOString(),
    },
  ];

  const res = await fetch(`${HABITICA_BASE}/tasks/user`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Habitica API error ${res.status}: ${err.message || res.statusText}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * Get a Habitica task by ID and return its completion status.
 * @param {string} taskId - Habitica task UUID
 * @returns {Promise<{completed: boolean, id: string}|null>}
 */
export async function getHabiticaTask(taskId) {
  const res = await fetch(`${HABITICA_BASE}/tasks/${taskId}`, {
    headers: getHeaders(),
  });

  if (!res.ok) return null;

  const { data } = await res.json();
  return { id: data.id, completed: data.completed };
}

/**
 * Delete a Habitica task by ID.
 * @param {string} taskId
 */
export async function deleteHabiticaTask(taskId) {
  const res = await fetch(`${HABITICA_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: getHeaders(),
  });
  return res.ok;
}

/**
 * Create multiple Habitica todos, logging progress.
 * 
 * @param {Array<{title: string, notes: string, dueDate: string}>} tasks
 * @param {boolean} dryRun - If true, just log without creating
 * @returns {Promise<number>} number of tasks created
 */
export async function createHabiticaTasks(tasks, dryRun = false) {
  if (tasks.length === 0) {
    console.log('   No tasks to create.');
    return 0;
  }

  let created = 0;

  for (const task of tasks) {
    if (dryRun) {
      console.log(`   [DRY RUN] Would create: "${task.title}" (due ${task.dueDate || 'none'})`);
      created++;
      continue;
    }

    try {
      const result = await createHabiticaTask(task);
      const reminderInfo = result.reminders?.length ? ' with reminder' : '';
      console.log(`   ✅ Created: "${task.title}" (due ${task.dueDate || 'none'})${reminderInfo}`);
      created++;
    } catch (err) {
      console.error(`   ❌ Failed to create "${task.title}":`, err.message);
    }
  }

  return created;
}
