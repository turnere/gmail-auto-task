/**
 * Nanoleaf integration — flashes panels green when a new lead comes in.
 *
 * Uses the Nanoleaf local HTTP API. Requires:
 *   NANOLEAF_HOST — IP address of your Nanoleaf controller
 *   NANOLEAF_TOKEN — auth token (see below for pairing)
 *
 * To get a token:
 *   1. Hold the power button on your Nanoleaf for 5-7 seconds until the
 *      LED starts flashing (pairing mode).
 *   2. Within 30 seconds, run:  node -e "
 *        const r = await fetch('http://YOUR_NANOLEAF_IP:16021/api/v1/new', { method: 'POST' });
 *        console.log(await r.json());
 *      "
 *   3. Copy the auth_token into your .env as NANOLEAF_TOKEN.
 */

const NANOLEAF_PORT = 16021;

function getBaseUrl() {
  const host = process.env.NANOLEAF_HOST;
  const token = process.env.NANOLEAF_TOKEN;
  if (!host || !token) return null;
  return `http://${host}:${NANOLEAF_PORT}/api/v1/${token}`;
}

async function nanoleafPut(path, body) {
  const base = getBaseUrl();
  if (!base) return;
  const res = await fetch(`${base}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Nanoleaf ${path}: ${res.status} ${res.statusText}`);
  }
}

async function nanoleafGet(path) {
  const base = getBaseUrl();
  if (!base) return null;
  const res = await fetch(`${base}${path}`);
  if (!res.ok) return null;
  return res.json();
}

/**
 * Flash the Nanoleaf panels to signal a new lead.
 * Temporarily sets a bright green effect, waits, then restores the
 * previous state.
 *
 * @param {object} [opts]
 * @param {number} [opts.r=0]   - Red (0-255)
/**
 * Pulse the Nanoleaf brightness on the "Workin" scene to signal a new lead.
 * Goes: normal → bright → dim → normal, fairly quickly.
 */
export async function flashLeadAlert() {
  const base = getBaseUrl();
  if (!base) {
    console.log('   💡 Nanoleaf skipped (NANOLEAF_HOST/TOKEN not set)');
    return;
  }

  try {
    // Save current state
    const state = await nanoleafGet('/state');
    const prevOn = state?.on?.value;
    const prevBrightness = state?.brightness?.value ?? 50;

    // Make sure we're on Workin and turned on
    await nanoleafPut('/state', { on: { value: true } });
    await nanoleafPut('/effects', { select: 'Workin' });

    // Pulse: a subtle bright → dip → bright → restore
    const pause = (ms) => new Promise(r => setTimeout(r, ms));
    const bump = Math.min(prevBrightness + 25, 100);
    const dip = Math.max(prevBrightness - 12, 5);

    await nanoleafPut('/state', { brightness: { value: bump, duration: 0 } });
    await pause(300);
    await nanoleafPut('/state', { brightness: { value: dip, duration: 0 } });
    await pause(250);
    await nanoleafPut('/state', { brightness: { value: bump, duration: 0 } });
    await pause(300);
    await nanoleafPut('/state', { brightness: { value: prevBrightness, duration: 5 } });

    console.log('   💡 Nanoleaf pulsed ✓');

    // Restore off state if it was off before
    if (prevOn === false) {
      await pause(600);
      await nanoleafPut('/state', { on: { value: false } });
    }
    return true;
  } catch (err) {
    console.error('   ⚠️  Nanoleaf flash failed:', err.message);
    return false;
  }
}
