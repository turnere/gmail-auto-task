/**
 * Sonos notification — discovers speakers and plays TTS or sound alerts.
 * Uses the 'sonos' npm package for direct UPnP control (no bridge needed).
 */

import { AsyncDeviceDiscovery, Sonos } from 'sonos';

let cachedDevice = null;

/**
 * Discover or connect to a Sonos speaker.
 * If SONOS_HOST is set, connects directly. Otherwise discovers the first speaker on the network.
 * @returns {Promise<Sonos>}
 */
async function getSpeaker() {
  if (cachedDevice) return cachedDevice;

  const host = process.env.SONOS_HOST;

  if (host) {
    console.log(`🔊 Connecting to Sonos at ${host}...`);
    cachedDevice = new Sonos(host);
  } else {
    console.log('🔊 Discovering Sonos speakers on network...');
    const discovery = new AsyncDeviceDiscovery();
    cachedDevice = await discovery.discover();
    console.log(`   Found speaker: ${cachedDevice.host}`);
  }

  return cachedDevice;
}

/**
 * Set the Sonos speaker volume.
 * @param {number} volume - 0–100
 */
async function ensureVolume(volume) {
  const speaker = await getSpeaker();
  const currentVol = await speaker.getVolume();
  if (currentVol < volume) {
    await speaker.setVolume(volume);
  }
}

/**
 * Play a TTS notification on the Sonos speaker using the built-in
 * say() method, which uses a cloud TTS service.
 * 
 * @param {string} message - Text to speak
 * @param {number} [volume=40] - Volume level (0-100)
 */
export async function sayNotification(message, volume = 40) {
  try {
    const speaker = await getSpeaker();
    await ensureVolume(volume);

    console.log(`🔊 Speaking: "${message}"`);
    // The sonos library's play notification approach using a TTS URI
    // We'll use Google TTS via the Sonos HTTP API pattern
    const ttsUri = `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=en&q=${encodeURIComponent(message)}`;

    await speaker.playNotification({
      uri: ttsUri,
      onlyWhenPlaying: false,
      volume,
    });

    console.log('   Notification played ✓');
  } catch (err) {
    console.error('   ⚠️  Sonos TTS failed:', err.message);
    // Fall back to just a chime/alert tone
    await playAlertSound(volume).catch(() => {});
  }
}

/**
 * Play a built-in Sonos chime/doorbell sound.
 * @param {number} [volume=40] - Volume level
 */
export async function playAlertSound(volume = 40) {
  try {
    const speaker = await getSpeaker();
    await ensureVolume(volume);

    // Use a Sonos built-in chime by playing a short notification
    await speaker.playNotification({
      uri: 'x-rincon-buzzer:0',
      onlyWhenPlaying: false,
      volume,
    });

    console.log('   🔔 Alert sound played');
  } catch (err) {
    console.error('   ⚠️  Sonos alert sound failed:', err.message);
  }
}

/**
 * Full lead alert: plays accent chime then speaks the lead summary.
 * @param {object} lead - { summary, senderName, platform, urgency }
 */
export async function alertLead(lead) {
  const volume = parseInt(process.env.SONOS_VOLUME || '40', 10);
  const name = lead.senderName || 'Someone';
  const platform = lead.platform || 'your website';

  let message;
  if (lead.urgency >= 4) {
    message = `Urgent new lead! ${name} from ${platform}. ${lead.summary}`;
  } else {
    message = `New lead from ${name} via ${platform}. ${lead.summary}`;
  }

  await sayNotification(message, volume);
}
