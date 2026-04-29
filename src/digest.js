/**
 * Morning digest — fetches Habitica todos due today (and overdue) and pushes a summary.
 *
 * Run: `npm run digest`
 */

import 'dotenv/config';
import { getExistingTodos } from './habitica.js';
import { sendPush } from './pushover.js';

const HABITICA_WEB_URL = 'https://habitica.com/';

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

async function main() {
  console.log('\nBuilding morning digest...\n');

  const todos = await getExistingTodos();
  const today = todayYMD();

  const dueToday = [];
  const overdue = [];

  for (const t of todos) {
    if (!t.dueDate) continue;
    if (t.dueDate === today) dueToday.push(t);
    else if (t.dueDate < today) overdue.push(t);
  }

  console.log(`   ${dueToday.length} due today, ${overdue.length} overdue`);

  if (dueToday.length === 0 && overdue.length === 0) {
    const ok = await sendPush({
      title: 'No tasks due today',
      message: 'Nothing on the list.',
      url: HABITICA_WEB_URL,
      urlTitle: 'Open Habitica',
    });
    console.log(ok ? '   Sent "all clear" push' : '   Push not sent');
    return;
  }

  const lines = [];
  if (dueToday.length > 0) {
    lines.push(`Due today (${dueToday.length}):`);
    for (const t of dueToday) lines.push(`- ${t.title}`);
  }
  if (overdue.length > 0) {
    if (lines.length) lines.push('');
    lines.push(`Overdue (${overdue.length}):`);
    for (const t of overdue) lines.push(`- ${t.title}`);
  }

  const total = dueToday.length + overdue.length;
  const title = overdue.length > 0
    ? `${dueToday.length} due today, ${overdue.length} overdue`
    : `${dueToday.length} due today`;

  const ok = await sendPush({
    title,
    message: lines.join('\n'),
    url: HABITICA_WEB_URL,
    urlTitle: 'Open Habitica',
    // Bump priority if anything is overdue so it bypasses quiet hours
    priority: overdue.length > 0 ? 1 : 0,
  });

  console.log(ok ? `   Sent digest (${total} task${total === 1 ? '' : 's'})` : '   Push not sent');
}

main().catch(err => {
  console.error('\nDigest failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
