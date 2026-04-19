/**
 * Gmail Auto-Task — Main entry point
 * 
 * Fetches recent sent emails → extracts commitments via Claude → creates Habitica todos
 */

import 'dotenv/config';
import { getAuthClient } from './googleClient.js';
import { fetchSentEmails } from './gmail.js';
import { extractCommitments } from './extractor.js';
import { getExistingTodos, syncHabiticaTasks } from './habitica.js';

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

  // 3. Fetch existing Habitica todos so Claude can deduplicate
  console.log('\n📋 Fetching existing Habitica todos...');
  const existingTasks = await getExistingTodos();
  console.log(`   Found ${existingTasks.length} existing todo(s)\n`);

  // 4. Extract commitments from each email
  console.log(`🤖 Analyzing ${emails.length} email(s) with Claude (${model})...\n`);

  let totalCreated = 0;
  let totalUpdated = 0;
  const allTasks = [];

  for (const email of emails) {
    console.log(`📨 "${email.subject}" → ${email.to}`);
    const tasks = await extractCommitments(email, existingTasks, model);

    const actionable = tasks.filter(t => t.action !== 'none');
    const skipped = tasks.filter(t => t.action === 'none');

    if (actionable.length === 0 && skipped.length === 0) {
      console.log('   No commitments found.\n');
    } else {
      if (actionable.length > 0) {
        console.log(`   Found ${actionable.length} commitment(s):`);
        for (const t of actionable) {
          const verb = t.action === 'update' ? '✏️  update' : '➕ create';
          console.log(`     • [${verb}] ${t.title}`);
          t.notes = `From email: "${email.subject}" to ${email.to}\n${t.notes || ''}`.trim();
        }
      }
      if (skipped.length > 0) {
        console.log(`   Skipped ${skipped.length} (already covered by existing tasks)`);
      }
      allTasks.push(...actionable);
      console.log('');
    }
  }

  // 5. Sync todos to Habitica (create new + update existing)
  if (allTasks.length > 0) {
    console.log(`\n📋 Syncing ${allTasks.length} todo(s) to Habitica...\n`);
    const result = await syncHabiticaTasks(allTasks, dryRun);
    totalCreated = result.created;
    totalUpdated = result.updated;
  }

  // 6. Summary
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log('\n' + '─'.repeat(50));
  console.log(`✅ Done in ${elapsed}s`);
  console.log(`   📧 Emails scanned: ${emails.length}`);
  console.log(`   📋 Tasks created: ${totalCreated}`);
  console.log(`   ✏️  Tasks updated: ${totalUpdated}`);
  if (dryRun) console.log('   ⚠️  (dry run — nothing was actually created)');
  console.log('');
}

main().catch(err => {
  console.error('\n💥 Fatal error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
