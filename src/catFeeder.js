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

function parseFeedTimes(raw) {
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

function scheduleFeederAlerts() {
  const times = parseFeedTimes(process.env.CAT_FEED_TIMES || DEFAULT_TIMES);
  const volume = parseInt(process.env.CAT_FEED_VOLUME || '30', 10);

  if (times.length === 0) {
    console.error('❌ No valid feed times configured. Exiting.');
    process.exit(1);
  }

  console.log(`\n🐱 Cat Feeder Alert starting`);
  console.log(`   Sound:  triangle.mp3`);
  console.log(`   Volume: ${volume}`);
  console.log(`   TZ:     ${TIMEZONE}`);
  console.log(`   Feed times: ${times.map(t => t.raw).join(', ')}\n`);

  for (const { hour, minute, raw } of times) {
    const cronExpr = `${minute} ${hour} * * *`;

    cron.schedule(cronExpr, async () => {
      console.log(`🐱 [${new Date().toLocaleTimeString()}] Feeder alert for ${raw} — playing triangle…`);
      await playSound(TRIANGLE_PATH, volume);
    }, { timezone: TIMEZONE });

    console.log(`   ⏰ Scheduled: ${raw} CST`);
  }

  console.log('\n🐱 Waiting for next feed time… (Ctrl+C to stop)\n');
}

scheduleFeederAlerts();
