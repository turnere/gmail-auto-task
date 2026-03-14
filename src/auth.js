/**
 * One-time OAuth2 authentication flow.
 * Run this with: npm run auth
 * 
 * Opens a browser for Google sign-in, then saves the refresh token
 * to token.json for future unattended use.
 */

import { google } from 'googleapis';
import { readFile, writeFile } from 'fs/promises';
import { createServer } from 'http';
import { URL } from 'url';
import { exec } from 'child_process';

const SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/tasks',
];

const TOKEN_PATH = 'token.json';
const CREDENTIALS_PATH = 'credentials.json';

async function loadCredentials() {
  const content = await readFile(CREDENTIALS_PATH, 'utf-8');
  const { installed, web } = JSON.parse(content);
  const creds = installed || web;
  if (!creds) throw new Error('Invalid credentials.json — expected "installed" or "web" key');
  return creds;
}

async function authenticate() {
  const creds = await loadCredentials();

  const oauth2Client = new google.auth.OAuth2(
    creds.client_id,
    creds.client_secret,
    'http://localhost:3000/callback'
  );

  const authUrl = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    scope: SCOPES,
    prompt: 'consent', // Force refresh token generation
  });

  console.log('\n🔐 Opening browser for Google sign-in...\n');
  console.log('If the browser doesn\'t open, visit this URL:\n');
  console.log(authUrl + '\n');

  // Start a temporary local server to catch the OAuth callback
  const code = await new Promise((resolve, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url, 'http://localhost:3000');
      const code = url.searchParams.get('code');
      if (code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h1>✅ Authenticated! You can close this tab.</h1>');
        server.close();
        resolve(code);
      } else {
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end('<h1>❌ No code received</h1>');
      }
    });

    server.listen(3000, () => {
      // Try to open the browser on Windows/macOS/Linux
      const cmd = process.platform === 'win32' ? `start "" "${authUrl}"`
        : process.platform === 'darwin' ? `open "${authUrl}"`
        : `xdg-open "${authUrl}"`;
      exec(cmd, () => {}); // ignore errors — user can click manually
    });

    setTimeout(() => {
      server.close();
      reject(new Error('Timed out waiting for OAuth callback (60s)'));
    }, 60_000);
  });

  const { tokens } = await oauth2Client.getToken(code);
  oauth2Client.setCredentials(tokens);

  await writeFile(TOKEN_PATH, JSON.stringify(tokens, null, 2));
  console.log('✅ Token saved to', TOKEN_PATH);
  console.log('   You can now run: npm start\n');

  return oauth2Client;
}

authenticate().catch(err => {
  console.error('Auth failed:', err.message);
  process.exit(1);
});
