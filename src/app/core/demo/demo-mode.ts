import { isDevMode } from '@angular/core';
import { environment } from '../../../environments/environment';

/**
 * Demo mode runs the whole app against in-memory mock data behind a
 * pretend signed-in user, so the authenticated UI can be exercised
 * without a Firebase project, an approved account, or - most
 * importantly - any real membership data on screen.
 *
 * Two switches have to line up before it turns on:
 *
 *  1. AVAILABILITY. Always available in a dev build. In a production
 *     build only when ENABLE_DEMO_MODE=true was set at build time, so a
 *     normal deploy cannot be talked into showing fake data by anyone
 *     who guesses the URL.
 *  2. ACTIVATION. `?demo=1` turns it on for this browser tab, `?demo=0`
 *     turns it off. The choice is remembered in sessionStorage so it
 *     survives in-app navigation (Angular drops the query string) while
 *     still being scoped to one tab and one session.
 *
 * Both are read once, at module load, because the DI wiring in
 * app.config.ts has to decide which services to build before anything
 * renders.
 */

const STORAGE_KEY = 'avl-stake-tools:demo-mode';

/** Whether this build will honour a demo-mode request at all. */
export const demoModeAvailable = isDevMode() || environment.enableDemoMode;

function readStored(): boolean {
  try {
    return window.sessionStorage.getItem(STORAGE_KEY) === '1';
  } catch {
    // Private browsing or blocked storage - treat as "not requested".
    return false;
  }
}

function writeStored(active: boolean): void {
  try {
    if (active) window.sessionStorage.setItem(STORAGE_KEY, '1');
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // Storage is a convenience here; without it demo mode simply lasts
    // until the next navigation that drops the query string.
  }
}

function resolveActivation(): boolean {
  if (typeof window === 'undefined') return false;
  const param = new URLSearchParams(window.location.search).get('demo');
  let active: boolean;
  if (param === '1' || param === 'true') active = true;
  else if (param === '0' || param === 'false') active = false;
  else active = readStored();
  writeStored(active);
  return active;
}

/** True when this session is running on mock data. */
export const demoMode = demoModeAvailable && resolveActivation();

// Lets the stylesheet reserve room for the demo banner without every
// full-height container having to know whether the banner is there.
if (demoMode && typeof document !== 'undefined') {
  document.documentElement.classList.add('demo-mode');
}

/** Leave demo mode and reload into the real, signed-out app. */
export function exitDemoMode(): void {
  writeStored(false);
  window.location.assign('/');
}
