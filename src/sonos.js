/**
 * Sonos notification — discovers speakers and plays a "cha-ching" cash
 * register sound to alert on new leads.
 *
 * A tiny HTTP server serves the cha-ching.mp3 file so the Sonos speaker
 * can fetch it over the local network.
 */

import { AsyncDeviceDiscovery, Sonos } from 'sonos';
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import { flashLeadAlert } from './nanoleaf.js';
import { createHabiticaTask } from './habitica.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedDevice = null;
let soundServerBase = null;
const soundFiles = new Map();

// ---------------------------------------------------------------------------
// Local HTTP server to serve MP3 files to the Sonos speaker
// ---------------------------------------------------------------------------

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const addr of interfaces[name]) {
      if (!addr.internal && addr.family === 'IPv4') return addr.address;
    }
  }
  return '127.0.0.1';
}

async function ensureSoundServer() {
  if (soundServerBase) return soundServerBase;

  const port = parseInt(process.env.SONOS_SOUND_PORT || '5089', 10);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const filename = decodeURIComponent(path.basename(req.url));
      const buffer = soundFiles.get(filename);
      if (!buffer) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }
      console.log(`   >> Sonos fetched ${req.url} from ${req.socket.remoteAddress}`);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': buffer.length,
      });
      res.end(buffer);
    });

    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => {
      const ip = process.env.SONOS_CALLBACK_IP || getLocalIP();
      soundServerBase = `http://${ip}:${port}`;
      console.log(`🔊 Sound server listening → ${soundServerBase}`);
      resolve(soundServerBase);
    });
  });
}

function registerSound(mp3AbsPath) {
  const filename = path.basename(mp3AbsPath);
  if (!soundFiles.has(filename)) {
    soundFiles.set(filename, fs.readFileSync(mp3AbsPath));
  }
  return filename;
}

// ---------------------------------------------------------------------------
// Sonos speaker helpers
// ---------------------------------------------------------------------------

async function getSpeaker() {
  if (cachedDevice) return cachedDevice;

  const host = process.env.SONOS_HOST;
  if (host) {
    console.log(`🔊 Connecting to Sonos at ${host}…`);
    cachedDevice = new Sonos(host);
  } else {
    console.log('🔊 Discovering Sonos speakers on network…');
    const discovery = new AsyncDeviceDiscovery();
    cachedDevice = await discovery.discover();
    console.log(`   Found speaker: ${cachedDevice.host}`);
  }
  return cachedDevice;
}

/**
 * Play an arbitrary MP3 file on the Sonos speaker.
 * @param {string} mp3AbsPath - absolute path to the .mp3 file
 * @param {number} [volume] - 0–100  (defaults to SONOS_VOLUME or 20)
 */
export async function playSound(mp3AbsPath, volume) {
  const vol = volume ?? parseInt(process.env.SONOS_VOLUME || '20', 10);

  try {
    await ensureSoundServer();
    const filename = registerSound(mp3AbsPath);
    const uri = `${soundServerBase}/${encodeURIComponent(filename)}`;
    const speaker = await getSpeaker();

    await speaker.playNotification({
      uri,
      onlyWhenPlaying: false,
      volume: vol,
    });

    console.log(`   🔊 Sound played ✓ (${filename})`);
    return true;
  } catch (err) {
    console.error('   ⚠️  Sonos playSound failed:', err.message);
    return false;
  }
}

/**
 * Play the cha-ching cash register sound on the Sonos.
 * @param {number} [volume] - 0–100  (defaults to SONOS_VOLUME or 20)
 */
export async function playChaChing(volume) {
  return playSound(path.join(__dirname, 'cha-ching.mp3'), volume);
}

/**
 * Alert for a new lead — plays the cha-ching sound and flashes the Nanoleaf.
 * If either fails, creates a Habitica task to investigate.
 * @param {object} lead - { summary, senderName, platform, urgency }
 */
export async function alertLead(lead) {
  const name = lead.senderName || 'Someone';
  console.log(`🔊 New lead alert: ${name} via ${lead.platform || 'unknown'}`);

  const [sonosOk, nanoleafOk] = await Promise.all([
    playChaChing(),
    flashLeadAlert(),
  ]);

  const failures = [];
  if (!sonosOk) failures.push('Sonos');
  if (!nanoleafOk) failures.push('Nanoleaf');

  if (failures.length > 0) {
    try {
      await createHabiticaTask({
        title: `🔧 Fix lead alert: ${failures.join(' & ')} failed`,
        notes: `Alert for lead from ${name} (${lead.platform || 'unknown'}) triggered but ${failures.join(' and ')} didn't work. Check the device connections and logs.`,
      });
      console.log(`   📋 Habitica task created for ${failures.join(' & ')} failure`);
    } catch (err) {
      console.error('   ⚠️  Could not create Habitica task:', err.message);
    }
  }
}
