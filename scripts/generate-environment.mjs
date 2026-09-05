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

const config = {
  firebase: {
    apiKey: readEnv('FIREBASE_API_KEY'),
    authDomain: readEnv('FIREBASE_AUTH_DOMAIN'),
    projectId: readEnv('FIREBASE_PROJECT_ID'),
    storageBucket: readEnv('FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: readEnv('FIREBASE_MESSAGING_SENDER_ID'),
    appId: readEnv('FIREBASE_APP_ID'),
  },
  googleAuthHd: readEnv('GOOGLE_AUTH_HD', ''),
  // Demo mode (mock data, no Firebase) is always available in a dev build.
  // This flag is what lets a PRODUCTION build offer it, so it defaults to
  // false: a normal deploy can't be talked into showing fake data.
  enableDemoMode: readEnv('ENABLE_DEMO_MODE', 'false') === 'true',
};

const missing = Object.entries(config.firebase)
  .filter(([, value]) => !value)
  .map(([key]) => key);

if (missing.length) {
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
