/**
 * REST API for Home Assistant integration.
 *
 * Exposes the PawSync feeder schedule and Sonos chime controls so
 * Home Assistant can read/modify them via rest_command and REST sensors.
 *
 * Env vars:
 *   API_PORT=3000         # port for this server (default 3000)
 *   API_TOKEN=<secret>    # bearer token HA must send (required)
 *
 * Usage:  npm run api
 */

import 'dotenv/config';
import http from 'http';
import {
  scheduleFeederAlerts,
  getSchedule,
  updateSchedule,
  playFeederChime,
  parseFeedTimes,
} from './catFeeder.js';
import { playSound, playChaChing } from './sonos.js';

const PORT = parseInt(process.env.API_PORT || '3000', 10);
const API_TOKEN = process.env.API_TOKEN;

if (!API_TOKEN) {
  console.error('❌ API_TOKEN env var is required. Set it in .env and in Home Assistant.');
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function json(res, status, body) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > 1e5) {             // 100 KB limit
        req.destroy();
        reject(new Error('Body too large'));
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString()));
    req.on('error', reject);
  });
}

function authenticate(req) {
  const auth = req.headers['authorization'];
  if (!auth) return false;
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer') return false;
  // Constant-time comparison to avoid timing attacks
  if (token.length !== API_TOKEN.length) return false;
  let mismatch = 0;
  for (let i = 0; i < token.length; i++) {
    mismatch |= token.charCodeAt(i) ^ API_TOKEN.charCodeAt(i);
  }
  return mismatch === 0;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

async function handleRequest(req, res) {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const route = url.pathname;
  const method = req.method;

  // Health check — no auth needed
  if (route === '/api/health' && method === 'GET') {
    return json(res, 200, { status: 'ok', uptime: process.uptime() });
  }

  // All other routes require auth
  if (!authenticate(req)) {
    return json(res, 401, { error: 'Unauthorized' });
  }

  // -- Feeder schedule -------------------------------------------------------
  if (route === '/api/feeder/schedule' && method === 'GET') {
    return json(res, 200, getSchedule());
  }

  if (route === '/api/feeder/schedule' && method === 'PUT') {
    const body = JSON.parse(await readBody(req));
    if (!body.times || !Array.isArray(body.times)) {
      return json(res, 400, { error: 'times[] is required' });
    }
    // Validate before applying
    const parsed = parseFeedTimes(body.times.join(','));
    if (parsed.length === 0) {
      return json(res, 400, { error: 'No valid times provided' });
    }
    const schedule = updateSchedule(body.times, body.volume);
    return json(res, 200, schedule);
  }

  // -- Play feeder chime now -------------------------------------------------
  if (route === '/api/feeder/chime' && method === 'POST') {
    const ok = await playFeederChime();
    return json(res, ok ? 200 : 502, { played: ok });
  }

  // -- Sonos controls --------------------------------------------------------
  if (route === '/api/sonos/chaching' && method === 'POST') {
    const body = await readBody(req);
    const { volume } = body ? JSON.parse(body || '{}') : {};
    const ok = await playChaChing(volume);
    return json(res, ok ? 200 : 502, { played: ok });
  }

  // -- 404 -------------------------------------------------------------------
  json(res, 404, { error: 'Not found' });
}

// ---------------------------------------------------------------------------
// Server
// ---------------------------------------------------------------------------

const server = http.createServer(async (req, res) => {
  try {
    await handleRequest(req, res);
  } catch (err) {
    console.error('API error:', err);
    if (!res.headersSent) json(res, 500, { error: 'Internal server error' });
  }
});

// Start feeder cron jobs, then the API
scheduleFeederAlerts();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏠 Home Assistant API listening on http://0.0.0.0:${PORT}`);
  console.log(`   Endpoints:`);
  console.log(`     GET  /api/health            — health check`);
  console.log(`     GET  /api/feeder/schedule    — current PawSync schedule`);
  console.log(`     PUT  /api/feeder/schedule    — update schedule {times[], volume?}`);
  console.log(`     POST /api/feeder/chime       — play feeder chime now`);
  console.log(`     POST /api/sonos/chaching     — play cha-ching sound`);
  console.log('');
});
