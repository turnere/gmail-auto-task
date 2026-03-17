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

const __dirname = path.dirname(fileURLToPath(import.meta.url));

let cachedDevice = null;
let soundServerUrl = null;

// ---------------------------------------------------------------------------
// Local HTTP server to serve the MP3 to the Sonos speaker
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
  if (soundServerUrl) return soundServerUrl;

  const mp3Path = path.join(__dirname, 'cha-ching.mp3');
  const mp3Buffer = fs.readFileSync(mp3Path);
  const port = parseInt(process.env.SONOS_SOUND_PORT || '5089', 10);

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      console.log(`   >> Sonos fetched ${req.url} from ${req.socket.remoteAddress}`);
      res.writeHead(200, {
        'Content-Type': 'audio/mpeg',
        'Content-Length': mp3Buffer.length,
      });
      res.end(mp3Buffer);
    });

    server.on('error', reject);
    server.listen(port, '0.0.0.0', () => {
      const ip = process.env.SONOS_CALLBACK_IP || getLocalIP();
      soundServerUrl = `http://${ip}:${port}/cha-ching.mp3`;
      console.log(`🔊 Sound server listening → ${soundServerUrl}`);
      resolve(soundServerUrl);
    });
  });
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
 * Play the cha-ching cash register sound on the Sonos.
 * @param {number} [volume] - 0–100  (defaults to SONOS_VOLUME or 40)
 */
export async function playChaChing(volume) {
  const vol = volume ?? parseInt(process.env.SONOS_VOLUME || '20', 10);

  try {
    const uri = await ensureSoundServer();
    const speaker = await getSpeaker();

    await speaker.playNotification({
      uri,
      onlyWhenPlaying: false,
      volume: vol,
    });

    console.log('   💰 Cha-ching played ✓');
  } catch (err) {
    console.error('   ⚠️  Sonos cha-ching failed:', err.message);
  }
}

/**
 * Alert for a new lead — plays the cha-ching sound.
 * @param {object} lead - { summary, senderName, platform, urgency }
 */
export async function alertLead(lead) {
  const name = lead.senderName || 'Someone';
  console.log(`🔊 New lead alert: ${name} via ${lead.platform || 'unknown'}`);
  await playChaChing();
}
