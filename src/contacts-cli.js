/**
 * CLI for managing the contacts database (Supabase).
 * 
 * Usage:
 *   npm run contacts:add -- "Name" "email" "Company" "notes"
 *   npm run contacts:remove -- "email or id"
 *   npm run contacts:list
 *   npm run contacts:touched -- "email or id"
 */

import 'dotenv/config';
import { addContact, removeContact, listContacts, markContacted, getActivity } from './contacts.js';

const [,, command, ...args] = process.argv;

async function main() {
  switch (command) {
    case 'add': {
      const [name, email, company, notes] = args;
      if (!name) {
        console.log('Usage: npm run contacts:add -- "Name" "email@example.com" "Company" "notes"');
        console.log('       (email is optional — use "" to skip)');
        process.exit(1);
      }
      const c = await addContact({ name, email: email || null, company, notes });
      console.log(`✅ Added: ${c.name}${c.email ? ` (${c.email})` : ''}`);
      break;
    }

    case 'remove': {
      const [identifier] = args;
      if (!identifier) {
        console.log('Usage: npm run contacts:remove -- "email@example.com"');
        process.exit(1);
      }
      const removed = await removeContact(identifier);
      console.log(`🗑️  Removed: ${removed.name}${removed.email ? ` (${removed.email})` : ''}`);
      break;
    }

    case 'list': {
      const contacts = await listContacts();
      if (contacts.length === 0) {
        console.log('📭 No contacts yet. Add some with:\n   npm run contacts:add -- "Name" "email" "Company"');
        return;
      }
      console.log(`\n📋 Contacts (${contacts.length}):\n`);
      for (const c of contacts) {
        const status = c.last_contacted
          ? `last: ${c.last_contacted}`
          : 'never contacted';
        const company = c.company ? ` (${c.company})` : '';
        const email = c.email ? ` — ${c.email}` : '';
        const pending = c.habitica_task_id ? ' ⏳' : '';
        console.log(`  ${c.name}${company}${email} — ${status}${pending}`);
        if (c.notes) console.log(`    📝 ${c.notes}`);
      }
      console.log('');
      break;
    }

    case 'touched': {
      const [identifier] = args;
      if (!identifier) {
        console.log('Usage: npm run contacts:touched -- "email@example.com"');
        process.exit(1);
      }
      const today = new Date().toISOString().split('T')[0];
      const updated = await markContacted(identifier, today);
      if (updated) {
        console.log(`✅ Marked ${updated.name} as contacted on ${today}`);
      } else {
        console.log(`⚠️  No contact found: ${identifier}`);
      }
      break;
    }

    case 'activity': {
      const [identifier] = args;
      const limit = 30;
      // If an identifier is given, look up the contact first
      let contactId = null;
      if (identifier) {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(identifier);
        if (isUuid) {
          contactId = identifier;
        } else {
          // Find contact by email to get their ID
          const all = await listContacts();
          const match = all.find(c => c.email && c.email.toLowerCase() === identifier.toLowerCase());
          if (match) contactId = match.id;
          else {
            console.log(`⚠️  No contact found: ${identifier}`);
            return;
          }
        }
      }
      const activity = await getActivity(contactId, limit);
      if (activity.length === 0) {
        console.log('📭 No activity yet.');
        return;
      }
      console.log(`\n📜 Activity Log${contactId ? '' : ' (all contacts)'}:\n`);
      for (const a of activity) {
        const name = a.contacts?.name || 'Unknown';
        const company = a.contacts?.company ? ` (${a.contacts.company})` : '';
        const time = new Date(a.created_at).toLocaleString();
        const icon = {
          added: '➕', removed: '🗑️', contacted: '✅',
          edited: '✏️', task_created: '📋', task_completed: '🎉',
        }[a.action] || '•';
        console.log(`  ${icon} ${time} — ${name}${company}`);
        if (a.details) console.log(`    ${a.details}`);
      }
      console.log('');
      break;
    }

    default:
      console.log('📇 Contact Manager\n');
      console.log('Commands:');
      console.log('  npm run contacts:add      -- "Name" "email" "Company" "notes"');
      console.log('  npm run contacts:remove   -- "email or id"');
      console.log('  npm run contacts:list');
      console.log('  npm run contacts:touched  -- "email or id"  (mark as contacted today)');
      console.log('  npm run contacts:activity  [email or id]   (view activity log)');
      console.log('  npm run reconnect         (find who to reach out to)');
  }
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
