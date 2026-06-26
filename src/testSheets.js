/**
 * Quick test — writes a fake Showit inquiry row to the configured sheet.
 *
 * Usage:  node src/testSheets.js
 */

import 'dotenv/config';
import { getAuthClient } from './googleClient.js';
import { ensureHeaders, appendInquiryRow } from './sheets.js';

const FAKE_INQUIRY = {
  received_at:      'Wed, 6 May 2026 20:31:00 -0500',
  client_name:      'Test Client',
  partner_name:     'Test Partner',
  email:            'test@example.com',
  phone:            '6125550000',
  event_date:       '2026-08-01',
  event_type:       'wedding',
  venue:            'Aster House',
  location:         null,
  guest_count:      '50-60',
  package_interest: null,
  budget:           null,
  referral_source:  'Zola',
  submitted_from:   'https://ericturner.photography/about',
  notes:            'This is a test row written by testSheets.js — safe to delete.',
  lead_source:      'showit-website',
};

async function main() {
  console.log('\n🧪 Google Sheets write test\n');

  if (!process.env.SHOWIT_SHEET_ID) {
    console.error('❌ SHOWIT_SHEET_ID is not set in .env');
    process.exit(1);
  }

  console.log(`   Sheet ID : ${process.env.SHOWIT_SHEET_ID}`);
  console.log(`   Tab      : ${process.env.SHOWIT_SHEET_TAB || 'Inquiries'}\n`);

  console.log('🔑 Authenticating with Google...');
  const auth = await getAuthClient();
  console.log('   Authenticated ✓\n');

  console.log('📋 Ensuring header row exists...');
  await ensureHeaders(auth);
  console.log('   Headers OK ✓\n');

  console.log('✍️  Appending test row...');
  await appendInquiryRow(auth, FAKE_INQUIRY);
  console.log('   Row written ✓\n');

  console.log('✅ Success! Check your sheet for a "Test Client" row.');
  console.log('   You can delete that row once you confirm it looks right.\n');
}

main().catch(err => {
  console.error('\n💥 Test failed:', err.message);
  process.exit(1);
});
