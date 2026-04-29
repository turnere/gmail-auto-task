/**
 * Wrap-up push — lists Habitica todos created within the last N hours and
 * sends a single Pushover summary. Intended to run shortly after the daily
 * email scan so the new todos are picked up.
 *
 * Run: `npm run wrapup`
 *
 * Env:
 *   WRAPUP_HOURS — lookback window in hours (default: 2)
 */

import 'dotenv/config';
import { getExistingTodos } from './habitica.js';
import { sendPush } from './pushover.js';

const HABITICA_WEB_URL = 'https://habitica.com/';

async function main() {
  const hours = parseFloat(process.env.WRAPUP_HOURS || '2');
  const cutoff = Date.now() - hours * 60 * 60 * 1000;

  console.log(`\nBuilding wrap-up (todos created in last ${hours}h)...\n`);

  const todos = await getExistingTodos();
  const recent = todos.filter(t => {
    if (!t.createdAt) return false;
    const created = new Date(t.createdAt).getTime();
    return Number.isFinite(created) && created >= cutoff;
  });

  console.log(`   ${recent.length} task(s) created recently`);

  if (recent.length === 0) {
    console.log('   Nothing to send.');
    return;
  }

  const lines = [`Created in the last ${hours}h (${recent.length}):`];
  for (const t of recent) {
    const due = t.dueDate ? ` (due ${t.dueDate})` : '';
    lines.push(`- ${t.title}${due}`);
  }

  const ok = await sendPush({
    title: `${recent.length} new task${recent.length === 1 ? '' : 's'} today`,
    message: lines.join('\n'),
    url: HABITICA_WEB_URL,
    urlTitle: 'Open Habitica',
  });

  console.log(ok ? '   Sent wrap-up push' : '   Push not sent');
}

main().catch(err => {
  console.error('\nWrap-up failed:', err.message);
  console.error(err.stack);
  process.exit(1);
});
