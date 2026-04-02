/**
 * Cat Feeder Alert — plays a triangle sound on Sonos when the cat feeder
 * goes off, so the cat can hear it from other floors.
 *
 * All times are in Central Standard Time (America/Chicago).
 *
 * Configure via env vars (optional — sensible defaults are baked in):
 *   CAT_FEED_TIMES="05:00,06:00,07:00,14:00,15:00,16:00,17:00,18:00"
 *   CAT_FEED_VOLUME=30          # 0–100, default 30
 *
 * Usage:  npm run feeder
 */

import 'dotenv/config';
import cron from 'node-cron';
import path from 'path';
import { fileURLToPath } from 'url';
import { playSound } from './sonos.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TRIANGLE_PATH = path.join(__dirname, '..', 'triangle.mp3');
const TIMEZONE = 'America/Chicago';
const DEFAULT_TIMES = '05:00,06:00,07:00,14:00,15:00,16:00,17:00,18:00';

// ---------------------------------------------------------------------------
// Runtime state — allows the API to read/modify the schedule
// ---------------------------------------------------------------------------
let activeTimes = [];
let activeVolume = 30;
const scheduledJobs = new Map();   // "HH:MM" → cron task

export function getSchedule() {
  return {
    times: activeTimes.map(t => t.raw),
    volume: activeVolume,
    timezone: TIMEZONE,
  };
}

export function getTrianglePath() {
  return TRIANGLE_PATH;
}

export function parseFeedTimes(raw) {
  return raw
    .split(',')
    .map(t => t.trim())
    .filter(Boolean)
    .map(t => {
      const [hour, minute] = t.split(':').map(Number);
      if (isNaN(hour) || isNaN(minute) || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        console.error(`⚠️  Invalid feed time "${t}" — skipping`);
        return null;
      }
      return { hour, minute, raw: t };
    })
    .filter(Boolean);
}

function scheduleOne({ hour, minute, raw }, volume) {
  const cronExpr = `${minute} ${hour} * * *`;
  const task = cron.schedule(cronExpr, async () => {
    console.log(`🐱 [${new Date().toLocaleTimeString()}] Feeder alert for ${raw} — playing triangle…`);
    await playSound(TRIANGLE_PATH, volume);
  }, { timezone: TIMEZONE });
  scheduledJobs.set(raw, task);
  return task;
}

/**
 * Replace the running schedule with a new set of times.
 * @param {string[]} timeStrings - e.g. ["06:00","14:00"]
 * @param {number} [volume] - 0–100, keeps current if omitted
 */
export function updateSchedule(timeStrings, volume) {
  // Stop existing jobs
  for (const task of scheduledJobs.values()) task.stop();
  scheduledJobs.clear();

  const times = parseFeedTimes(timeStrings.join(','));
  if (volume !== undefined) activeVolume = volume;

  activeTimes = times;
  for (const t of times) {
    scheduleOne(t, activeVolume);
    console.log(`   ⏰ Re-scheduled: ${t.raw} CST`);
  }
  return getSchedule();
}

export function playFeederChime() {
  return playSound(TRIANGLE_PATH, activeVolume);
}

// ---------------------------------------------------------------------------
// Bootstrap — schedule from env on import, expose for standalone use
// ---------------------------------------------------------------------------
export function scheduleFeederAlerts() {
  const times = parseFeedTimes(process.env.CAT_FEED_TIMES || DEFAULT_TIMES);
  activeVolume = parseInt(process.env.CAT_FEED_VOLUME || '30', 10);
  activeTimes = times;

  if (times.length === 0) {
    console.error('❌ No valid feed times configured. Exiting.');
    process.exit(1);
  }

  console.log(`\n🐱 Cat Feeder Alert starting`);
  console.log(`   Sound:  triangle.mp3`);
  console.log(`   Volume: ${activeVolume}`);
  console.log(`   TZ:     ${TIMEZONE}`);
  console.log(`   Feed times: ${times.map(t => t.raw).join(', ')}\n`);

  for (const t of times) {
    scheduleOne(t, activeVolume);
    console.log(`   ⏰ Scheduled: ${t.raw} CST`);
  }

  console.log('\n🐱 Waiting for next feed time… (Ctrl+C to stop)\n');
}

// When run directly (npm run feeder), auto-start
const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isDirectRun) {
  scheduleFeederAlerts();
}
