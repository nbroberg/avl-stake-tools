# Stake Presidency Tools (POC)

A lightweight web app for stake presidency calling and sustaining
workflows — the proposal, presidency approval, high council approval,
interview assignment, extension, acceptance, sustaining, setting apart,
and LCR recording of stake-level callings — built to run entirely from
**GitHub Pages + Firebase Authentication + Cloud Firestore**, with
**GitHub Actions** as the build/deploy pipeline. No custom backend, no
containers.

This is the **Angular** rewrite of the original React/Vite POC. The
scope has been intentionally narrowed to the calling workflow plus the
minimum roster and audit support that workflow needs — scheduling,
appointments, and public booking pages have been deliberately removed
from the initial architecture.

## How authorization works (read this first)

Firebase Authentication (Google sign-in) only proves **who** someone
is. It does **not** by itself grant access to anything. After sign-in,
the app looks up `users/{firebaseUid}` in Firestore; only an **active**
user record with an assigned role can see any protected data. An
authenticated-but-unapproved Google account is routed to
`/access-denied`. This is enforced twice: once by a route guard (for a
good experience) and independently in `firestore.rules` (the actual
security boundary — the guard alone would not stop someone from reading
Firestore directly).

**Roles (POC — deliberately small):**

- `stake_presidency` — full read/write on the calling workflow, the
  roster, and every calling-status transition.
- `high_council` — read everything; may only advance a workflow from
  `presidency_approved` to `high_council_approved`. No other writes.

Users cannot elevate themselves — `users/{uid}` is not writable from
the app under any circumstances. New user records, role changes, and
deactivations are done directly in the Firebase Console.

## Calling lifecycle

Both `calling` and `release` workflow types share the first two states
but then diverge. New callings walk the full 10-state pipeline;
releases skip the high council step (ordinary stake callings do not go
back through the high council for release) and skip the interview
assignment.

**New calling (10 states):**

```
Proposed
   ↓
Stake Presidency Approved
   ↓
High Council Approved
   ↓
Interview Assigned          ← presidency member is assigned to conduct
   ↓                          the interview / extend the calling
Interview / Calling Extended
   ↓
Accepted
   ↓
Sustained
   ↓
Set Apart
   ↓
Recorded in LCR
   ↓
Complete
```

**Release (7 states):**

```
Proposed → Stake Presidency Approved → Release Extended → Released →
Sustained → Recorded in LCR → Complete
```

Every transition writes an entry to the workflow's `history/`
subcollection (append-only, no updates or deletes) with the actor's UID,
display name, and any note (e.g. the interview assignee's name).

## Project layout

```
src/
  app/
    core/            Firebase init, AuthService (signals), route guard,
                      Firestore-backed services (callings/people), and
                      pure logic (LCR parsing, calling status machine,
                      role helpers) - kept separate from components so
                      it's independently testable
    auth/             Login and access-denied pages
    layout/           App shell: header + nav + <router-outlet>
    shared/           StatusBadgeComponent
    models/           TypeScript interfaces (Person, CallingWorkflow,
                      CallingStatus, AppUser, ...)
    pages/            Routed screens (callings, people, diagnostics,
                      dashboard)
    app.routes.ts     Route table (functional authGuard on protected routes)
    app.config.ts     Application-wide providers (router, zone config)
  environments/       Generated Firebase config (see "First local setup")
tests/                Vitest unit tests for parsing + status-machine logic
firestore.rules       The actual authorization boundary
firestore.indexes.json
firebase.json
.github/workflows/deploy.yml   type-check -> lint -> test -> build -> deploy to GitHub Pages
```

## Angular-specific notes

- **Standalone components throughout** — no `NgModule`s. Templates are
  inline (`template: \`...\``) to keep each feature in a single file.
- **Signals for local/reactive state** (`signal()`, `computed()`,
  `effect()`), with `toSignal()`/`toObservable()` bridging to the
  Firestore `onSnapshot` listeners, which are exposed as RxJS
  `Observable`s from the `core/*.service.ts` files.
- **New `@if`/`@for` control-flow syntax** (Angular 17+) is used
  throughout instead of `*ngIf`/`*ngFor`.
- **Template-driven forms** (`FormsModule`) rather than Reactive Forms.
  Every bound field is a signal, and the template uses the explicit
  `[ngModel]="field()"` / `(ngModelChange)="field.set($event)"` split.

### Zoneless change detection

Angular is **zoneless from v21 onward** — `zone.js` is not a
dependency, is not listed under `polyfills` in `angular.json`, and
`app.config.ts` deliberately does not call `provideZoneChangeDetection`.
Angular v22 also makes `ChangeDetectionStrategy.OnPush` the default.

The practical rule that follows:

> **Component state that the template reads must be a `signal()`.**

Without zone.js, Angular only re-renders when a signal changes, a
template event binding fires, or an `AsyncPipe` emits. A plain field
mutated inside an `await`, `.then()`, `setTimeout`, or an RxJS
`.subscribe()` will update the field but leave the screen stale.

## First-time setup

### 1. Create the Firebase project

**Stay on the free (Spark) plan.** This app is a static Angular SPA;
it does not need Firebase App Hosting (Blaze-only, requires billing).
The classic Firebase Hosting product would also work, but the CI
pipeline in this repo publishes to GitHub Pages instead — no Firebase
Hosting setup needed.

1. **Create the project.** In the [Firebase console](https://console.firebase.google.com/),
   click **Add project**, give it a short id (e.g. `avlstake`), decline
   Google Analytics unless you have a reason to enable it.

2. **Register a Web app inside the project.** A "project" is a
   container; the Firebase Web SDK config values only exist after you
   register an app inside it:
   - Top-left, click the **⚙ gear icon** → **Project settings**
   - On the **General** tab (default), scroll to the **Your apps**
     section at the bottom of the page
   - Click the **Web icon** (`</>`) — *not* the Hosting page in the
     left nav, which is a different feature
   - Give it a nickname (e.g. `avl-stake-tools`); **uncheck** the
     "Also set up Firebase Hosting" box (we're using GitHub Pages)
   - Click **Register app**. The screen that appears has the
     `firebaseConfig` block with `apiKey`, `authDomain`, `projectId`,
     `storageBucket`, `messagingSenderId`, `appId` — these six values
     are what you'll paste into GitHub Secrets in step 5, and
     optionally into `.env.local` for local dev against the real
     project. They are not privileged secrets (see `.env.example`),
     but keeping them per-environment is still worth doing.

3. **Enable Google sign-in.** In the left sidebar under **Product
   categories**, find **Authentication** — the Firebase console has
   reorganized this a few times; it currently lives under the
   **Security** group (formerly under "Build"). Click **Authentication
   → Get started → Sign-in method** tab → **Google** row → toggle
   **Enable**, set a support email, save. On the same page,
   **Settings** tab → **Authorized domains** — confirm `localhost` is
   present and add the GitHub Pages host (e.g.
   `<your-github-user>.github.io`).

4. **Enable Firestore.** In the left sidebar under **Product
   categories → Databases & Storage → Firestore Database → Create
   database**. Pick a region close to you (permanent choice — e.g.
   `us-east1` for the eastern US). **Start in production mode** — the
   rules in this repo replace the default deny-all/allow-all template
   in the next step.

> Firebase periodically renames and reorganizes its console sidebar
> (the "Build" group was split into Databases & Storage, Security,
> Hosting & Serverless, and DevOps & Engagement mid-2025). If the
> names above don't match what you see, look for the *product* name
> ("Authentication", "Firestore Database") anywhere in the sidebar.

To confirm your app registered, from the repo root:

```
firebase apps:list --project <your-project-id>
```

### 2. Deploy Firestore rules and indexes

Install the Firebase CLI once (macOS: `brew install firebase-cli`, or
via npm: `npm install -g firebase-tools`), then:

```
firebase login
cp .firebaserc.example .firebaserc   # edit in your real project id
firebase deploy --only firestore:rules,firestore:indexes
```

> **Do not run `firebase init` in this repo.** All the config files it
> would create (`firebase.json`, `firestore.rules`,
> `firestore.indexes.json`) already exist with the app's rules and
> indexes; `init` would prompt to overwrite them with empty templates
> and quietly destroy the RBAC / quorum / lifecycle rules if you
> accept the defaults.

Re-run the `deploy` command any time `firestore.rules` or
`firestore.indexes.json` change. This is the one manual step outside
of the GitHub Actions pipeline — the workflow builds and deploys the
frontend but does not deploy Firestore rules, specifically so a rules
change requires a deliberate, reviewed step from an authorized
machine rather than shipping automatically alongside a frontend
change.

### 3. Create the presidency and high council user records

The app cannot grant itself the first role — one document has to be
created by hand for each user:

1. Ask each presidency member and high councilor to sign in once (they
   land on `/access-denied`). Copy each Firebase UID from the console
   under Authentication → Users.
2. In the Firebase console, create a document at `users/{uid}` for each
   with fields:
   ```
   firebaseUid: "<uid>"       (string)
   email: "<their email>"     (string)
   displayName: "<name>"      (string)
   role: "stake_presidency"   (string; or "high_council")
   active: true               (boolean)
   ```
3. Reload the app — they should now see the dashboard.

There is no in-app user management UI in this POC. All role changes
happen in the Firebase Console.

### 4. Local development

**Node 22.22.3+, 24.15.0+, or 26+ is required.** Check with `node -v`.

```
npm install
cp .env.example .env.local   # fill in your Firebase web config
npm start                    # runs scripts/generate-environment.mjs, then `ng serve`
```

**Local emulator fallback.** If `.env.local` is empty (no Firebase
config), `src/app/core/firebase.ts` automatically wires the app to the
local Firebase emulators (see `firebase.json`) — Auth on port 9099,
Firestore on 8080 — under a `demo-avl-stake-tools` project id. Start
the emulators alongside the dev server:

```
firebase emulators:start --only auth,firestore
```

Java is required for the Firestore emulator. On macOS,
`brew install openjdk` and put it on PATH.

### 5. GitHub setup

**Enable Pages via Actions.** In your GitHub repo:
**Settings → Pages → Build and deployment → Source: GitHub Actions**.
This tells GitHub to publish whatever the deploy workflow uploads,
rather than expecting a `gh-pages` branch.

**Actions secrets.** **Settings → Secrets and variables → Actions →
New repository secret**, one per key below (values from your Firebase
project — see `.env.example`):

- `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`
- `GOOGLE_AUTH_HD` (optional; leave unset if not restricting the
  Google consent screen to one Workspace/consumer domain)

`ENABLE_DIAGNOSTICS_LINK` (optional) is read as a variable rather than a
secret: **Settings → Secrets and variables → Actions → Variables**,
set `ENABLE_DIAGNOSTICS_LINK=false` to hide the diagnostics link from
the sign-in screen in production builds.

**Base href.** The workflow sets `--base-href "/<repo>/"` automatically
from `${{ github.event.repository.name }}`, matching the default
project-page URL shape `https://<owner>.github.io/<repo>/`. If you're
deploying to a user/org root page or a custom domain, edit the
`--base-href` line in `.github/workflows/deploy.yml`.

**Firebase authorized domains.** In the Firebase console under
**Authentication → Settings → Authorized domains**, add:

- `<owner>.github.io` (the Pages URL)
- `localhost` (for local dev; usually pre-added by Firebase)

## Feature notes and scope decisions

- **Callings/sustainings**: `callingWorkflows/{id}` holds the current
  status plus denormalized `personName`/`unit` for fast list rendering;
  a `history/` subcollection is the append-only audit trail (writable
  via `create` only — never edited or deleted). New-calling and release
  lifecycles share document shape via a `workflowType` flag but use
  separate status orderings (see [types.ts](src/app/models/types.ts) and
  [calling-status.ts](src/app/core/calling-status.ts)). High Council
  approval is unconditional for new callings and skipped for releases.
  Interview assignment captures the presidency member responsible for
  extending the calling; the workflow cannot advance past
  `interview_assigned` without one.
- **LCR roster import**: [lcr-parser.ts](src/app/core/lcr-parser.ts)
  reads a pasted LCR *Callings custom report* export. It never connects
  to LCR - it only parses text you've already copied. The custom
  report must include: **Full Name**, **Birth Year**, **Unit**,
  **Callings** (or **Callings with Date Sustained** to also capture
  time-in-calling). Optional but recommended: **Preferred Name**
  (used for display; falls back to Full Name), **Individual E-mail**,
  **Individual Phone**. Everything else the LCR custom-report builder
  offers - full birthdate, address, ordinance dates, marriage/sealing
  status, temple recommend fields, etc. - is deliberately not
  requested, so this data category never leaves LCR through this
  paste. Person records are keyed by a slug of `Full Name + Birth Year`
  (e.g. `john-andrew-smith-1970`); re-importing the same person
  updates the same doc. Membership Record Numbers would be the truly-
  stable identity but aren't reliably exposed in LCR's copy-paste
  flow - see the JSDoc on `Person` in `models/types.ts` for the
  trade-offs.
- **Deferred out of scope**: temple recommend and leader interview
  scheduling, availability windows, public booking, and calendar
  integration have been intentionally removed from the initial
  architecture. Do not add appointment tables, availability models,
  or public booking flows without an actual requirement.

## Testing priorities (build this up in order)

1. **GitHub Pages deployment works** — push to the default branch,
   confirm the **Deploy to GitHub Pages** workflow finishes green and the
   `https://<owner>.github.io/<repo>/` URL loads.
2. **The JS app loads on the Church meetinghouse network** — open the
   URL on that network; you should see the sign-in screen.
3. **Firebase Google auth works** — sign in; you should land on either
   the dashboard (if already an authorized user) or `/access-denied`.
4. **Firestore authenticated read works** — visit `/diagnostics` and
   run the connectivity checks while signed in.
5. **Firestore authenticated write works** — same diagnostics page.
6. **Firestore rules correctly reject unauthorized users** — before
   your account has a role, reading `callingWorkflows` should fail with
   `permission-denied`.

`/diagnostics` has no auth guard on its route, specifically so it's
useful for exactly this kind of incremental, from-the-meetinghouse-
network troubleshooting.

## Reference

Functional inspiration (not cloned): the publicly documented
[Leader and Clerk Tools](https://leaderclerktools.org/user-guide.html)
user guide.
