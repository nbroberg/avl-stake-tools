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

## High council review

A calling that needs the high council's approval stops at
`presidency_approved` until enough councilors respond. Each member acts
individually — there is no group vote object — and each has three moves:

| Action | Effect |
| --- | --- |
| **Approve** | Adds their UID to `hcApprovalUids`. Two-step: the first tap arms a confirmation. |
| **Withdraw** | Removes it again. Only while the workflow is still at `presidency_approved`; once it advances, votes freeze. |
| **Raise a concern** | Moves their UID to `hcConcernUids` instead. |

A member holds at most one position at a time — approving clears their
concern and vice versa — enforced in `firestore.rules`, not just the UI.

**A concern is not a veto.** It doesn't change the approval arithmetic, but
it does block the *high council's own* advance path, so a concern has to be
talked through and cleared — or the stake presidency advances the workflow
themselves, which is recorded in the audit trail. One councilor can slow the
council down; only the presidency can overrule.

**Quorum** is snapshotted onto each workflow at creation (`hcRequired`) from
`HC_QUORUM_REQUIRED` in `core/quorum.ts` — currently ceil(12 × 0.7) = 9. A
stake with a different council size should change `HC_TOTAL` before going
live, since a 9-of-10 threshold is near-unanimous.

**Who sees what.** Councilors see the tally only (`8 of 9`). The presidency
additionally sees *who* approved and who raised a concern, resolved from the
audit trail. Note the asymmetry that isn't there: **"who hasn't voted" is
deliberately not shown to anyone**, because answering it would mean letting
clients enumerate the `users` collection, and the rules keep each account
readable only by its owner. Chasing stragglers stays an out-of-band job.

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

**Sustaining across the stake is presidency-overridable.** A stake-wide
calling/release normally can't reach `Sustained` until every unit has
signed off (see `core/sunday-visit.ts`'s `completesSustaining`), but the
presidency can advance it anyway - Firestore rules already give them
unconditional write access here. Doing so writes an explicit audit note
recording how many units had actually confirmed at the time.

**Recording in LCR finalizes the workflow.** Marking `Recorded in LCR`
writes straight through to `Complete` in the same update (both dates get
stamped) rather than waiting on a separate click - there's nothing left
to do once it's recorded. It also flips `rosterSync/status` to
`pending: true`, which shows the presidency a "Roster sync required"
banner on the dashboard, since the `people` collection has no live LCR
connection and may now be behind. A completed roster import clears the
flag automatically - both the in-app paste importer
(`pages/people/roster-import.component.ts`) and the `tools/lcr-client`
CLI do this on a successful write - since an import actually catching
the roster up is a real, observable event, unlike an LCR-side change
happening at all. The dashboard also has a manual "Mark roster synced"
button as a fallback for anything outside those two paths.

## Project layout

```
src/
  app/
    core/            Firebase init, AuthService (signals), route guard,
                      Firestore-backed services (callings/people), and
                      pure logic (LCR parsing, calling status machine,
                      role helpers) - kept separate from components so
                      it's independently testable
    core/hc-review.ts Pure helpers for the high council step (what awaits
                      me, the tally, resolving voter names) - shared by the
                      list, dashboard and detail screens
    core/demo/        Demo mode: in-memory stand-ins for the three
                      Firestore-backed services, a mock dataset, and an
                      invented unit vocabulary. Loaded as a lazy chunk,
                      only when demo mode is active - see "Demo mode" below
    auth/             Login and access-denied pages
    layout/           App shell: header + nav + <router-outlet>
    shared/           StatusBadgeComponent, DemoBannerComponent
    models/           TypeScript interfaces (Person, CallingWorkflow,
                      CallingStatus, AppUser, ...)
    pages/            Routed screens (callings, people, diagnostics,
                      dashboard)
    app.routes.ts     Route table (functional authGuard on protected routes)
    app.config.ts     Application-wide providers (router, zone config)
  environments/       environment.ts is generated by scripts/generate-
                      environment.mjs from .env.local (local) or GitHub
                      Actions secrets (CI). The file is gitignored so
                      local project values don't leak into git history;
                      the npm pre-hooks on start/build/type-check/lint/
                      test regenerate it on demand.
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

### 4b. Demo mode (mock data, no Firebase)

Demo mode runs the whole app against an in-memory dataset behind a
pretend signed-in user. It exists so the authenticated UI can be
exercised — on a phone, in a review, in a screenshot — without a
Firebase project, an approved Google account, or any real membership
data on screen.

```
npm start
```

then open **http://localhost:4200/?demo=1**. `?demo=0` leaves it, as
does the **Exit** button in the banner.

What it covers:

- **Everything above the data layer is the real thing.** Only
  `AuthService`, `PeopleService` and `CallingsService` are swapped, for
  in-memory equivalents that mirror their write semantics. The route
  guard, the Handbook authorities rules, the status machine, the LCR
  parser and every component run unmodified.
- **Writes work and stick until reload.** Create a workflow, advance it,
  record high council approvals, edit notes, paste and import a roster.
- **A role switch in the banner** flips the pretend user between Stake
  Presidency and High Council, which is the only way to exercise both
  permission paths without two real accounts.
- **The seed data is shaped to hit the edges**: vacant slots so the Scope
  report renders its gap markers, a workflow parked at each interesting
  status, one two short of high council quorum, and one whose priesthood
  office deliberately mismatches the calling.

**Nothing on screen is real.** Every name, birth year, email and phone in
`core/demo/demo-data.ts` is invented; emails use the reserved
`example.com` domain and phones the reserved `555-01xx` range. The wards
and branches are invented too — `core/demo/demo-units.ts` replaces the
stake's real unit vocabulary for the whole session via
`overrideStakeUnits()`, so a demo never names an actual unit. The
importer, the Scope report and the New Calling dropdown all read the
active vocabulary, so they validate against the fake units exactly as
they would against the real ones.

**Availability is gated.** Demo mode is always available in a dev build.
A production build only offers it when `ENABLE_DEMO_MODE=true` was set at
build time, so a normal deploy cannot be talked into showing fake data by
anyone who guesses the URL. Either way the mock dataset lives in a lazy
chunk that a normal build never loads.

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
