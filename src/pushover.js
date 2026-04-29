/**
 * Pushover notification helper.
 * Docs: https://pushover.net/api
 *
 * Required env vars:
 *   PUSHOVER_USER_KEY  — your Pushover user key
 *   PUSHOVER_API_TOKEN — your application API token
 */

const PUSHOVER_URL = 'https://api.pushover.net/1/messages.json';

/**
 * Send a Pushover notification.
 *
 * @param {object} opts
 * @param {string} opts.message  - body text (required)
 * @param {string} [opts.title]  - notification title
 * @param {string} [opts.url]    - supplementary URL (e.g. Habitica task link)
 * @param {string} [opts.urlTitle] - label for the URL
 * @param {number} [opts.priority] - -2..2 (default 0). Use 1 to bypass quiet hours.
 * @param {string} [opts.sound]    - sound name from pushover.net/api#sounds
 * @returns {Promise<boolean>} true if sent
 */
export async function sendPush({ message, title, url, urlTitle, priority, sound }) {
  const userKey = process.env.PUSHOVER_USER_KEY;
  const apiToken = process.env.PUSHOVER_API_TOKEN;

  if (!userKey || !apiToken) {
    console.warn('   ⚠️  Pushover not configured (set PUSHOVER_USER_KEY and PUSHOVER_API_TOKEN). Skipping push.');
    return false;
  }

  if (!message) {
    console.warn('   ⚠️  sendPush called without a message. Skipping.');
    return false;
  }

  const body = new URLSearchParams({
    token: apiToken,
    user: userKey,
    message,
  });
  if (title) body.set('title', title);
  if (url) body.set('url', url);
  if (urlTitle) body.set('url_title', urlTitle);
  if (typeof priority === 'number') body.set('priority', String(priority));
  if (sound) body.set('sound', sound);

  try {
    const res = await fetch(PUSHOVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      console.error(`   ❌ Pushover error ${res.status}: ${text}`);
      return false;
    }

    return true;
  } catch (err) {
    console.error(`   ❌ Pushover request failed: ${err.message}`);
    return false;
  }
}
