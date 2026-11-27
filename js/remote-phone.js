import { t } from './strings.js';
import { isCode } from './tv-code.js';

// What the coach's phone keeps for the remote (js/remote.js): its TVs (sg-tvs, this browser only), its screen kept on
// while the clock runs, and saying so when the database is slow to answer.
const tvsKey = 'sg-tvs';
let wake = null;
let awake = false; // whether the phone was last asked to stay awake

export function rememberedTvs() {
  try {
    const kept = JSON.parse(localStorage.getItem(tvsKey));
    return Array.isArray(kept) ? kept.filter((tv) => isCode(tv?.code) && typeof tv.name === 'string') : [];
  } catch {
    return [];
  }
}

export function keepTvs(tvs) {
  try { localStorage.setItem(tvsKey, JSON.stringify(tvs)); } catch {}
}

export const awakeAsked = () => awake;

// While the clock runs, the phone's screen stays on where the browser allows it.
export async function keepAwake(running) {
  awake = running;
  try {
    if (!running) {
      const lock = wake;
      wake = null;
      await lock?.release();
    } else if (!wake && navigator.wakeLock && document.visibilityState === 'visible') {
      wake = await navigator.wakeLock.request('screen');
      wake.addEventListener('release', () => { wake = null; });
    }
  } catch {}
}

// Coming back to the page: the screen kept on again (the browser let it go).
export function awakeAgainOnReturn() {
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') awake = false; });
}

// Waiting for the database more than a few seconds: the page says there is no connection. The live session keeps
// trying by itself, and the remote carries on once it answers.
const patience = 4000;
export function sayWhileWaiting(waiting, line) {
  const slow = setTimeout(() => { if (line()) line().textContent = t('noConnection'); }, patience);
  return waiting.finally(() => clearTimeout(slow));
}
