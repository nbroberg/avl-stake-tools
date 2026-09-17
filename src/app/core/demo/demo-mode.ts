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
 *
 * FORCED BUILDS bypass switch 2 entirely. The deploy workflow builds the
 * app a second time with FORCE_DEMO_MODE=true and publishes it under
 * /demo/, so that path is mock data unconditionally - no query string to
 * remember, nothing to accidentally leave. That build ships no Firebase
 * config at all, so honouring `?demo=0` there would only hand the visitor
 * a real app pointed at an empty project. Forcing is therefore absolute:
 * the parameter and the stored choice are not consulted.
 */

const STORAGE_KEY = 'avl-stake-tools:demo-mode';

/** Whether this build will honour a demo-mode request at all. */
export const demoModeAvailable = isDevMode() || environment.enableDemoMode;

/**
 * Whether this build is demo-only - mock data with no way out. True just
 * for the bundle published under /demo/; see exitDemoMode() and the
 * banner's Exit button, both of which are meaningless here.
 */
export const demoModeForced = environment.forceDemoMode;

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
  // A forced build is demo mode by construction - don't let a stale
  // sessionStorage entry or a hand-typed ?demo=0 talk it out of that.
  if (demoModeForced) return true;
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

/**
 * Leave demo mode and reload into the real, signed-out app at the site
 * root. A forced build has no real app to return to, so this does
 * nothing there - the banner hides the control rather than offering an
 * Exit that lands on a broken page.
 */
export function exitDemoMode(): void {
  if (demoModeForced) return;
  writeStored(false);
  window.location.assign('/');
}
