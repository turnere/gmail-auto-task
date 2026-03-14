/**
 * Google API client — shared OAuth2 setup for Gmail and Tasks.
 */

import { google } from 'googleapis';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

const CREDENTIALS_PATH = 'credentials.json';
const TOKEN_PATH = 'token.json';

/**
 * Build an authenticated OAuth2 client.
 * Supports two modes:
 *   1. Local dev: reads credentials.json + token.json from disk
 *   2. CI/GitHub Actions: reads base64-encoded env vars
 */
export async function getAuthClient() {
  let creds, token;

  if (process.env.GOOGLE_CREDENTIALS_BASE64) {
    // CI mode — decode from env
    creds = JSON.parse(
      Buffer.from(process.env.GOOGLE_CREDENTIALS_BASE64, 'base64').toString()
    );
    token = JSON.parse(
      Buffer.from(process.env.GOOGLE_TOKEN_BASE64, 'base64').toString()
    );
  } else {
    // Local mode — read files
    if (!existsSync(CREDENTIALS_PATH)) {
      throw new Error(
        'credentials.json not found. Download it from Google Cloud Console.\n' +
        'See README.md for setup instructions.'
      );
    }
    if (!existsSync(TOKEN_PATH)) {
      throw new Error(
        'token.json not found. Run `npm run auth` first to authenticate.'
      );
    }
    creds = JSON.parse(await readFile(CREDENTIALS_PATH, 'utf-8'));
    token = JSON.parse(await readFile(TOKEN_PATH, 'utf-8'));
  }

  const { installed, web } = creds;
  const c = installed || web || creds; // handle both credential shapes

  const oauth2Client = new google.auth.OAuth2(
    c.client_id,
    c.client_secret,
    c.redirect_uris?.[0] || 'http://localhost:3000/callback'
  );

  oauth2Client.setCredentials(token);
  return oauth2Client;
}
