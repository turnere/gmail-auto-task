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
 * Fetch all incomplete todos from Habitica, optionally filtered by tag.
 * @returns {Promise<Array<{id: string, text: string, notes: string, date: string, tags: string[]}>>}
 */
export async function getExistingTodos() {
  const res = await fetch(`${HABITICA_BASE}/tasks/user?type=todos`, {
    headers: getHeaders(),
  });

  if (!res.ok) {
    console.warn('   ⚠️  Could not fetch existing todos');
    return [];
  }

  const { data: todos } = await res.json();

  // Filter to our tag if we have one
  const tagId = await getOrCreateTag();
  const filtered = tagId
    ? todos.filter(t => t.tags?.includes(tagId))
    : todos;

  return filtered.map(t => ({
    id: t.id,
    title: t.text,
    notes: t.notes || '',
    dueDate: t.date ? t.date.split('T')[0] : null,
  }));
}

/**
 * Update an existing Habitica task.
 * Only sends fields that are provided.
 *
 * @param {string} taskId
 * @param {object} updates - { title?, notes?, dueDate? }
 * @returns {Promise<object>} updated task data
 */
export async function updateHabiticaTask(taskId, updates) {
  const body = {};
  if (updates.title) body.text = updates.title;
  if (updates.notes) body.notes = updates.notes;
  if (updates.dueDate) body.date = updates.dueDate;

  const res = await fetch(`${HABITICA_BASE}/tasks/${taskId}`, {
    method: 'PUT',
    headers: getHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(`Habitica update error ${res.status}: ${err.message || res.statusText}`);
  }

  const data = await res.json();
  return data.data;
}

/**
 * Sync tasks to Habitica — creates new todos or updates existing ones.
 * 
 * Each task object should have:
 *   - action: "create" | "update" | "none"
 *   - existingTaskId?: string (required for "update")
 *   - title, notes, dueDate
 * 
 * @param {Array<{action: string, existingTaskId?: string, title: string, notes: string, dueDate: string}>} tasks
 * @param {boolean} dryRun
 * @returns {Promise<{created: number, updated: number}>}
 */
export async function syncHabiticaTasks(tasks, dryRun = false) {
  const actionable = tasks.filter(t => t.action !== 'none');

  if (actionable.length === 0) {
    console.log('   No tasks to create or update.');
    return { created: 0, updated: 0 };
  }

  let created = 0;
  let updated = 0;

  for (const task of actionable) {
    if (task.action === 'update' && task.existingTaskId) {
      if (dryRun) {
        console.log(`   [DRY RUN] Would update: "${task.title}" (due ${task.dueDate || 'none'})`);
        updated++;
        continue;
      }

      try {
        await updateHabiticaTask(task.existingTaskId, task);
        console.log(`   ✏️  Updated: "${task.title}" (due ${task.dueDate || 'none'})`);
        updated++;
      } catch (err) {
        console.error(`   ❌ Failed to update "${task.title}":`, err.message);
      }
    } else {
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
  }

  return { created, updated };
}
