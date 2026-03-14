/**
 * Creates tasks in Google Tasks from extracted commitments.
 */

import { google } from 'googleapis';

/**
 * Get or create the task list to use.
 * Uses the default "@default" list for simplicity.
 * 
 * @param {import('googleapis').Auth.OAuth2Client} auth
 * @returns {Promise<string>} task list ID
 */
async function getTaskListId(auth) {
  const tasks = google.tasks({ version: 'v1', auth });
  // "@default" is the user's primary task list
  return '@default';
}

/**
 * Create a single task in Google Tasks.
 * 
 * @param {import('googleapis').Auth.OAuth2Client} auth
 * @param {object} task - { title, notes, dueDate }
 */
export async function createTask(auth, task) {
  const tasksApi = google.tasks({ version: 'v1', auth });
  const listId = await getTaskListId(auth);

  const res = await tasksApi.tasks.insert({
    tasklist: listId,
    requestBody: {
      title: task.title,
      notes: task.notes || '',
      due: task.dueDate ? new Date(task.dueDate).toISOString() : undefined,
    },
  });

  return res.data;
}

/**
 * Create multiple tasks, logging progress.
 * 
 * @param {import('googleapis').Auth.OAuth2Client} auth
 * @param {Array<{title: string, notes: string, dueDate: string}>} tasks
 * @param {boolean} dryRun - If true, just log without creating
 * @returns {Promise<number>} number of tasks created
 */
export async function createTasks(auth, tasks, dryRun = false) {
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
      await createTask(auth, task);
      console.log(`   ✅ Created: "${task.title}" (due ${task.dueDate || 'none'})`);
      created++;
    } catch (err) {
      console.error(`   ❌ Failed to create "${task.title}":`, err.message);
    }
  }

  return created;
}
