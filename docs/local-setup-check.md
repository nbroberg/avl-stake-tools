# Local setup check (for an AI assistant on the maintainer's computer)

You are running on the maintainer's own computer. A cloud session that has
both repos but **no** private credentials wrote this checklist. Your job is
to check the parts only this machine can check, then write a short report
the maintainer can paste back into that cloud session.

## Ground rules (read first)

- **Read-only.** Don't write to Firestore, Firebase Auth, GitHub secrets,
  the Keychain or LCR. Don't deploy anything. Don't commit or push.
- **Never print a secret value.** Don't print API keys, service-account
  JSON, private keys, tokens, passwords, or the contents of `.env.local`.
  Report only "present/missing", lengths, file
  permissions and non-secret metadata such as a project ID or a
  service-account email.
- **Never print member data.** Don't print names, birth years or callings
  from LCR exports or the whitelist. Counts and file dates are fine.
- The `--dry-run` runs in step 6 only read from Firestore. Skip them if
  anything in steps 1–5 looks wrong, and ask the maintainer before running
  any other command that talks to Firebase or LCR.
- If a step fails, record it and move on. Don't fix things unless the
  maintainer says to.

## 1. Repo layout

The sync repo imports the app's parser through a relative path
(`../avl-stake-tools/src/app/core/lcr-parser.ts`), so the two checkouts must
be **siblings in the same folder**.

- [ ] Find both checkouts: `avl-stake-tools` and `avl-stake-sync`.
- [ ] Confirm they share the same parent directory.
- [ ] For each one, report the branch, `git status --short` (count only),
      and whether it's behind `origin` after `git fetch`.
- [ ] Confirm `avl-stake-tools/src/app/core/lcr-parser.ts` exists.

## 2. App config: `avl-stake-tools/.env.local`

- [ ] `.env.local` exists and `git check-ignore .env.local` confirms it's
      ignored.
- [ ] For each key, report only whether it's set or missing. Use this
      (prints no values):

```bash
cd avl-stake-tools
for k in FIREBASE_API_KEY FIREBASE_AUTH_DOMAIN FIREBASE_PROJECT_ID FIREBASE_STORAGE_BUCKET FIREBASE_MESSAGING_SENDER_ID FIREBASE_APP_ID GOOGLE_AUTH_HD GOOGLE_GEOCODING_API_KEY ENABLE_DEMO_MODE; do
  if grep -qE "^$k=.+" .env.local; then echo "$k: set"; else echo "$k: MISSING"; fi
done
```

- [ ] `.firebaserc` exists, is ignored by git, and its `default` project
      matches `FIREBASE_PROJECT_ID`. A project ID isn't secret, so it's fine
      to print it.

## 3. GitHub Actions secrets (names only)

`deploy.yml` reads eight repo secrets. Values can't be read; just check
the names.

- [ ] `gh secret list --repo nbroberg/avl-stake-tools` contains all of:
      `FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
      `FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`,
      `FIREBASE_APP_ID`, `GOOGLE_AUTH_HD`, `GOOGLE_GEOCODING_API_KEY`.
- [ ] Report each one's "updated" date. If `.env.local` was changed after a
      secret was last updated, flag it as possibly stale.

## 4. Deployed Firestore rules vs. the repo

Rules are deployed by hand (`firebase deploy --only firestore:rules`), never
by CI, so the live rules can drift from `firestore.rules`.

- [ ] `firebase --version` works and `firebase login:list` shows a signed-in
      account. Report the account email.
- [ ] Compare the live ruleset with the repo file. One way to do this,
      using the gcloud CLI if it's signed in to the same Google account:

```bash
P=<FIREBASE_PROJECT_ID>
T=$(gcloud auth print-access-token)
RS=$(curl -s -H "Authorization: Bearer $T" "https://firebaserules.googleapis.com/v1/projects/$P/releases/cloud.firestore" | python3 -c 'import sys,json;print(json.load(sys.stdin)["rulesetName"])')
curl -s -H "Authorization: Bearer $T" "https://firebaserules.googleapis.com/v1/$RS" \
  | python3 -c 'import sys,json;print(json.load(sys.stdin)["source"]["files"][0]["content"])' > /tmp/live.rules
diff -u /tmp/live.rules avl-stake-tools/firestore.rules && echo "RULES MATCH"
```

- [ ] Report "match" or a short summary of the diff. Rules contain no
      secrets, so printing the diff is fine.
- [ ] Do **not** deploy the rules, even if they differ.

## 5. Sync tool: `avl-stake-sync`

Everything lives under `~/.avl-stake-tools/` by default.

**Node and dependencies**
- [ ] Report `node --version`. Check whether `node_modules` exists in
      `avl-stake-sync`. If it doesn't, ask the maintainer before running
      `npm ci`.

**Service-account key** (`~/.avl-stake-tools/firebase-service-account.json`,
or the path in `$GOOGLE_APPLICATION_CREDENTIALS`)
- [ ] It exists **outside** both git checkouts.
- [ ] Its permissions are `600`: `stat -f '%Lp' <file>` on macOS, or
      `stat -c '%a' <file>` on Linux.
- [ ] Its `project_id` matches `FIREBASE_PROJECT_ID`, and you can report its
      `client_email`. Read only those two fields, for example with
      `python3 -c 'import json,sys;d=json.load(open(sys.argv[1]));print(d["project_id"],d["client_email"])' <file>`.
      Never print `private_key` or `private_key_id`.
- [ ] Search both repos' git history for a committed key:
      `git log --all --oneline -- '*service-account*' '*serviceAccount*'`
      (should print nothing).
- [ ] Optionally, if gcloud is available: list the account's keys
      (`gcloud iam service-accounts keys list --iam-account <client_email> --managed-by=user`)
      and report how many there are and how old they are. Also list the
      account's project roles:

```bash
gcloud projects get-iam-policy <P> --flatten='bindings[].members' --filter='bindings.members:<client_email>' --format='value(bindings.role)'
```

  Flag any key older than a year and any role broader than the scripts
  need, such as `roles/owner` or `roles/editor`.

**LCR browser profile and Keychain**
- [ ] `~/.avl-stake-tools/lcr-profile` exists and isn't inside a git
      checkout.
- [ ] Keychain entry (macOS only, **without** `-w`, so no password is shown):
      `security find-generic-password -s avl-stake-tools-lcr >/dev/null 2>&1 && echo present || echo absent`.

**Data files**
- [ ] For `~/.avl-stake-tools/lcr-data/`, report the file names, sizes and
      modification dates only. Don't open them.
- [ ] Report whether `~/.avl-stake-tools/user-whitelist.json` exists, how
      many entries it has, and how many have each role. Don't print emails.
- [ ] Confirm no `.tsv`, `.csv` or `custom-report*.json` files are tracked
      in either repo: `git ls-files | grep -E '\.(tsv|csv)$|custom-report'`.

## 6. Dry runs (only if steps 1–5 passed)

These read from Firestore but write nothing.

- [ ] In `avl-stake-sync`, run `npm run import -- --dry-run`. Report only
      whether it parsed and the summary counts (rows parsed, would-create,
      would-update, warnings). Don't print names.
- [ ] In `avl-stake-sync`, run `npm run provision -- --dry-run`. Report only
      the counts: found, not yet signed in, would-change, and users not in
      the whitelist.

## 7. Report back

Finish with one block the maintainer can paste into the cloud session:

```
LOCAL CHECK REPORT
1 Layout:        OK | <problem>
2 .env.local:    keys set N/9; .firebaserc project ok?
3 GH secrets:    N/8 present; possibly stale: <names>
4 Rules:         live == repo? <yes | summary of diff>
5 Sync tool:     node vX; deps installed?; key outside repo/600/project ok?; key count/age; roles; profile; keychain
                 data files: <names + dates>; whitelist: N entries (P presidency / H high council)
6 Dry runs:      import <counts | skipped/failed>; provision <counts | skipped/failed>
Problems found:  <bullets, or "none">
```
