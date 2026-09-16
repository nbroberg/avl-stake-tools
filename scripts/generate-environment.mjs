#!/usr/bin/env node
// Generates src/environments/environment.ts from environment variables.
//
// In GitHub Actions, these come from repository secrets, which are
// already plain process.env values for the build step (see
// .github/workflows/deploy.yml). For local development, put them in a
// ".env.local" file at the repo root (KEY=value per line, "#" comments
// allowed, no quoting needed) - this script loads it if present.
// .env.local is gitignored; see .env.example for the keys to set.
//
// Angular's TypeScript config values (project id, API key, etc.) are not
// privileged secrets - the same values ship inside any Firebase web app's
// public JS bundle - but keeping them out of committed source still means
// the repo has no environment-specific values baked in.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const ENV_LOCAL_PATH = '.env.local';
const OUT_PATH = 'src/environments/environment.ts';

function loadDotEnvLocal() {
  if (!existsSync(ENV_LOCAL_PATH)) return {};
  const out = {};
  for (const line of readFileSync(ENV_LOCAL_PATH, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    out[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
  return out;
}

const local = loadDotEnvLocal();
const readEnv = (key, fallback = '') => process.env[key] ?? local[key] ?? fallback;
const readFlag = (key) => readEnv(key, 'false') === 'true';

// FORCE_DEMO_MODE builds the demo-only bundle that ships under /demo/.
// It implies availability: a forced build that wasn't also "available"
// would boot the real app against config it deliberately doesn't have,
// so the two can't be set inconsistently.
const forceDemoMode = readFlag('FORCE_DEMO_MODE');

// A forced build gets BLANK Firebase config, whatever the environment
// offers. Demo mode swaps out every Firestore-backed service, so the
// values would be dead weight - but more to the point, the demo is
// published to an unauthenticated public path, and "no project config in
// that bundle" should be a property of the build rather than a lucky
// consequence of CI not having a .env.local. Without this, running the
// demo build on a developer machine quietly bakes the real project's
// config into it.
const firebaseEnv = (key) => (forceDemoMode ? '' : readEnv(key));

const config = {
  firebase: {
    apiKey: firebaseEnv('FIREBASE_API_KEY'),
    authDomain: firebaseEnv('FIREBASE_AUTH_DOMAIN'),
    projectId: firebaseEnv('FIREBASE_PROJECT_ID'),
    storageBucket: firebaseEnv('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: firebaseEnv('FIREBASE_MESSAGING_SENDER_ID'),
    appId: firebaseEnv('FIREBASE_APP_ID'),
  },
  googleAuthHd: forceDemoMode ? '' : readEnv('GOOGLE_AUTH_HD', ''),
  // Demo mode (mock data, no Firebase) is always available in a dev build.
  // This flag is what lets a PRODUCTION build offer it, so it defaults to
  // false: a normal deploy can't be talked into showing fake data.
  enableDemoMode: forceDemoMode || readFlag('ENABLE_DEMO_MODE'),
  // ...and this one makes a build demo-ONLY, with no switch back. See the
  // header comment in src/app/core/demo/demo-mode.ts.
  forceDemoMode,
};

const missing = Object.entries(config.firebase)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (forceDemoMode) {
  // Expected, not a problem: demo mode replaces every Firestore-backed
  // service, so a forced build has no use for Firebase config and is
  // built without it on purpose. Warning here would cry wolf on every
  // demo deploy.
  console.log('[generate-environment] Demo-only build - Firebase config intentionally omitted.');
} else if (missing.length) {
  console.warn(
    `[generate-environment] Missing Firebase config values: ${missing.join(', ')}. ` +
      'The app will still build, but Firebase calls will fail at runtime until these ' +
      'are set in .env.local (local dev) or repository secrets (GitHub Actions).',
  );
}

mkdirSync(dirname(OUT_PATH), { recursive: true });
writeFileSync(
  OUT_PATH,
  '// GENERATED FILE - do not edit directly. See scripts/generate-environment.mjs\n' +
    `export const environment = ${JSON.stringify(config, null, 2)};\n`,
);
console.log(`[generate-environment] Wrote ${OUT_PATH}`);
