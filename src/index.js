/**
 * Gmail Auto-Task — Main entry point
 * 
 * Fetches recent sent emails → extracts commitments via Claude → creates Habitica todos
 */

import 'dotenv/config';
import { getAuthClient } from './googleClient.js';
import { fetchSentEmails } from './gmail.js';
import { extractCommitments } from './extractor.js';
import { createHabiticaTasks } from './habitica.js';

async function main() {
  const startTime = Date.now();
  console.log('\n🚀 Gmail Auto-Task Starting...\n');

  // Config from env
  const hoursBack = parseInt(process.env.HOURS_TO_LOOK_BACK || '24', 10);
  const model = process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514';
  const dryRun = process.env.DRY_RUN === 'true';

  if (dryRun) console.log('⚠️  DRY RUN mode — no tasks will be created\n');

  // 1. Authenticate
  console.log('🔑 Authenticating with Google...');
  const auth = await getAuthClient();
  console.log('   Authenticated ✓\n');

  // 2. Fetch sent emails
  const emails = await fetchSentEmails(auth, hoursBack);
  if (emails.length === 0) {
    console.log('\n✨ No sent emails found. Nothing to do!\n');
    return;
  }

  // 3. Extract commitments from each email
  console.log(`\n🤖 Analyzing ${emails.length} email(s) with Claude (${model})...\n`);

  let totalTasks = 0;
  const allTasks = [];

  for (const email of emails) {
    console.log(`📨 "${email.subject}" → ${email.to}`);
    const tasks = await extractCommitments(email, model);

    if (tasks.length === 0) {
      console.log('   No commitments found.\n');
    } else {
      console.log(`   Found ${tasks.length} commitment(s):`);
      for (const t of tasks) {
        console.log(`     • ${t.title}`);
        // Add email context to notes
        t.notes = `From email: "${email.subject}" to ${email.to}\n${t.notes || ''}`.trim();
      }
      allTasks.push(...tasks);
      console.log('');
    }
  }

  // 4. Create todos in Habitica (with reminders)
  if (allTasks.length > 0) {
    console.log(`\n📋 Creating ${allTasks.length} todo(s) in Habitica...\n`);
    totalTasks = await createHabiticaTasks(allTasks, dryRun);
  }

  // 5. Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   📧 Emails scanned: ${emails.length}`);
  console.log(`   📋 Tasks created: ${totalTasks}`);
  if (dryRun) console.log('   ⚠️  (dry run — nothing was actually created)');
  console.log('');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
