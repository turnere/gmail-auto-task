/**
 * Appends a parsed Showit inquiry as a new row in a Google Sheet.
 *
 * The sheet acts as the Zapier trigger source — Zapier watches for new rows
 * and creates the HoneyBook project from the column values.
 *
 * Required env vars:
 *   SHOWIT_SHEET_ID   — the Google Spreadsheet ID (from its URL)
 *   SHOWIT_SHEET_TAB  — sheet tab name (default: "Inquiries")
 *
 * Column order (row 1 should have these as headers):
 *   received_at | client_name | partner_name | email | phone |
 *   event_date | event_type | venue | location | guest_count |
 *   package_interest | budget | referral_source | submitted_from | notes | lead_source
 */

import { google } from 'googleapis';

const SHEET_ID  = process.env.SHOWIT_SHEET_ID;
const SHEET_TAB = process.env.SHOWIT_SHEET_TAB || 'Inquiries';

// Column order — must match the header row in the spreadsheet
const COLUMNS = [
  'received_at',
  'client_name',
  'partner_name',
  'email',
  'phone',
  'event_date',
  'event_type',
  'venue',
  'location',
  'guest_count',
  'package_interest',
  'budget',
  'referral_source',
  'submitted_from',
  'notes',
  'lead_source',
];

/**
 * Appends one inquiry row to the configured Google Sheet.
 *
 * @param {import('googleapis').Auth.OAuth2Client} auth
 * @param {object} inquiry - Parsed inquiry object from parseShowitInquiry() + metadata fields
 * @returns {Promise<void>}
 */
export async function appendInquiryRow(auth, inquiry) {
  if (!SHEET_ID) {
    throw new Error('SHOWIT_SHEET_ID is not set in .env');
  }

  const sheets = google.sheets({ version: 'v4', auth });

  const row = COLUMNS.map(col => inquiry[col] ?? '');

  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'USER_ENTERED', // lets Sheets parse dates/numbers naturally
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] },
  });
}

/**
 * Ensures the header row exists in the sheet. Safe to call on every startup —
 * only writes if A1 is empty.
 *
 * @param {import('googleapis').Auth.OAuth2Client} auth
 */
export async function ensureHeaders(auth) {
  if (!SHEET_ID) return;

  const sheets = google.sheets({ version: 'v4', auth });

  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
  });

  const a1 = res.data.values?.[0]?.[0];
  if (a1) return; // Headers already present

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_TAB}!A1`,
    valueInputOption: 'RAW',
    requestBody: { values: [COLUMNS] },
  });

  console.log(`   📋 Header row written to "${SHEET_TAB}"`);
}
