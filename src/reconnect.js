/**
 * Reconnect — checks completed Habitica tasks to mark contacts as connected,
 * then finds the contact you haven't reached out to the longest
 * and creates a new Habitica todo.
 * 
 * Run with: npm run reconnect
 * Designed to be run weekly (e.g., via cron or GitHub Actions).
 */

import 'dotenv/config';
import {
  findLeastRecentlyContacted,
  listContacts,
  getContactsWithPendingTasks,
  markContacted,
  setHabiticaTaskId,
  logActivity,
} from './contacts.js';
import { createHabiticaTask, getHabiticaTask, deleteHabiticaTask } from './habitica.js';

async function main() {
  console.log('\n🤝 Reconnect Check\n');

  const dryRun = process.env.DRY_RUN === 'true';
  if (dryRun) console.log('⚠️  DRY RUN mode — no tasks will be created\n');

  // Step 1: Check pending Habitica tasks for completion
  console.log('🔍 Checking pending reconnect tasks...\n');
  const pending = await getContactsWithPendingTasks();

  for (const contact of pending) {
    const task = await getHabiticaTask(contact.habitica_task_id);
    const company = contact.company ? ` (${contact.company})` : '';

    if (!task) {
      // Task was deleted from Habitica — clear the reference
      console.log(`   ⚠️  ${contact.name}${company} — Habitica task missing, clearing`);
      await setHabiticaTaskId(contact.id, null);
    } else if (task.completed) {
      // Task completed = they reached out!
      const today = new Date().toISOString().split('T')[0];
      await markContacted(contact.id, today);
      await logActivity(contact.id, 'task_completed', `Completed Habitica reconnect task`);
      console.log(`   ✅ ${contact.name}${company} — reconnected! Marked as contacted`);
    } else {
      console.log(`   ⏳ ${contact.name}${company} — task still pending`);
    }
  }

  if (pending.length === 0) {
    console.log('   No pending tasks to check.\n');
  } else {
    console.log('');
  }

  // Step 2: Show current contact status
  const all = await listContacts();
  if (all.length === 0) {
    console.log('📭 No contacts in your database yet.');
    console.log('   Add some with: npm run contacts:add -- "Name" "email" "Company"');
    return;
  }

  console.log(`📋 You have ${all.length} contact(s) in your database:\n`);
  for (const c of all) {
    const status = c.last_contacted
      ? `last contacted ${c.last_contacted} (${daysAgo(c.last_contacted)} days ago)`
      : 'never contacted';
    const company = c.company ? ` (${c.company})` : '';
    const pending = c.habitica_task_id ? ' ⏳' : '';
    console.log(`   • ${c.name}${company} — ${status}${pending}`);
  }

  // Step 3: Find who to reach out to next
  const contact = await findLeastRecentlyContacted();
  if (!contact) {
    console.log('\n✨ All contacts have pending reconnect tasks. Nothing new to create.');
    return;
  }

  const company = contact.company ? ` at ${contact.company}` : '';
  const ago = contact.last_contacted
    ? `${daysAgo(contact.last_contacted)} days since last contact`
    : 'never contacted';

  console.log(`\n🎯 Reach out to: ${contact.name}${company}`);
  console.log(`   ${ago}`);
  if (contact.email) console.log(`   📧 ${contact.email}`);
  if (contact.notes) console.log(`   📝 ${contact.notes}`);

  // Build the Habitica task
  const task = {
    title: `Reconnect: Reach out to ${contact.name}${company}`,
    notes: [
      contact.email ? `Email: ${contact.email}` : '',
      ago,
      contact.notes ? `Notes: ${contact.notes}` : '',
    ].filter(Boolean).join('\n'),
    dueDate: getNextWeekday().toISOString().split('T')[0],
  };

  if (dryRun) {
    console.log(`\n   [DRY RUN] Would create task: "${task.title}" (due ${task.dueDate})`);
    return;
  }

  console.log(`\n📋 Creating Habitica todo...`);
  try {
    const result = await createHabiticaTask(task);
    await setHabiticaTaskId(contact.id, result.id);
    console.log(`   ✅ Created: "${task.title}" (due ${task.dueDate})`);
  } catch (err) {
    console.error(`   ❌ Failed to create task:`, err.message);
  }

  console.log('');
}

/** Calculate days since a YYYY-MM-DD date string */
function daysAgo(dateStr) {
  const then = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  return Math.floor((now - then) / (1000 * 60 * 60 * 24));
}

/** Get next weekday (Mon-Fri) as a due date */
function getNextWeekday() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
