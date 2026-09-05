# Stake Presidency Tools — User Guide

This guide is for the stake presidency and high council members actually
using the app day to day. If you're setting up the project itself, see the
main [README](../README.md) instead — this doesn't cover installation,
Firebase configuration, or deployment.

## Signing in

Go to the app's URL and click **Sign in with Google**. Use the same Google
account your stake clerk or administrator has on file for you.

Signing in only proves who you are — it doesn't automatically give you
access. If your account hasn't been added to the app yet, you'll land on an
**"Access not yet granted"** screen after signing in. That's expected the
first time: it means your sign-in worked, but nobody has approved your
account yet. Let your Stake Clerk or Admin know you've signed in once (this
step can't be skipped — they need your account to exist before they can
approve it), and they'll add you. Once they do, the screen updates on its
own — no need to sign in again or refresh.

## Roles

There are two roles in this app:

- **Stake Presidency** — full access: create and edit any calling, release,
  or priesthood advancement; delete a workflow created in error; advance or
  roll back any step; override sustaining requirements when needed.
- **High Council** — can see everything, but can only act at specific
  points: casting a vote (approve or raise a concern) on a proposal once
  it's reached Stake Presidency Approved, and recording what happens during
  a Sunday visit to a unit — sustaining, releasing, setting apart, or
  ordaining, in person.

Your role is set by whoever administers the app for your stake — there's no
way to change your own role or anyone else's from inside the app.

## Getting around

The navigation bar has six sections:

- **Dashboard** — your starting point after signing in.
- **Units** — pick the ward or branch you're visiting this Sunday to see
  exactly what needs doing there.
- **Assignments** — everything currently waiting on you, and (for the
  presidency) everything waiting stake-wide.
- **Callings & Releases** — every calling and release workflow, from
  proposal through completion.
- **Priesthood Advancements** — Priest → Elder and Elder → High Priest
  workflows.
- **Diagnostics** — a connectivity check page, useful if the app seems
  stuck or won't load data (see [Diagnostics](#diagnostics) below).

### Dashboard

Shows a welcome banner with your name, and:

- If you're a **high councilor** with something waiting on you, a
  call-to-action tile up top tells you how many proposals or priesthood
  advancements need your response — tap it to go straight to Assignments.
  If nothing's waiting, it says so plainly.
- A list of links into the other sections.
- If a workflow was recently recorded in LCR, a **"Roster sync required"**
  banner (presidency only) — a reminder that the app's local copy of the
  roster may be a step behind LCR until someone re-imports it. There's a
  **Mark roster synced** button to clear the banner by hand if the import
  happened outside the app.

## Proposing a calling or release

From **Callings & Releases**, presidency members see a **+ New** button.

1. Choose **New Calling** or **Release**.
2. Pick the calling. For a release, the dropdown only lists callings
   someone in the roster currently holds — you can't release from an empty
   seat.
3. For a calling that belongs to a ward, branch, or elders quorum, pick the
   unit — this also narrows the person list to that unit's members. Some
   callings (stake-level ones, like High Council or a stake auxiliary) have
   no unit to pick.
4. If the calling is a single-seat position that's already filled, you'll
   see who currently holds it with a **Release ↗** link that opens a
   release workflow for them in a new tab, so you can run both side by
   side.
5. Search for and select the person. The list is filtered to people who
   meet the calling's requirements (priesthood office, an existing calling
   for callings that are normally extended to someone already serving,
   etc.) — a note under the search box explains what's filtering the list
   and how many people got excluded. If a calling normally requires an
   existing calling but you have a real exception, there's a checkbox to
   include people with no current calling.
6. Optionally add notes.
7. Click **Create**.

This creates the workflow at the **Proposed** status and takes you to its
detail page.

## The calling lifecycle

A new calling moves through ten steps in order — nothing can be skipped,
and (apart from the presidency's override abilities below) each step needs
the right person to act:

1. **Proposed** — created by the presidency.
2. **Stake Presidency Approved** — the presidency's own sign-off.
3. **High Council Approved** — reached once enough councilors approve (see
   [High council voting](#high-council-voting) below). Skipped entirely for
   callings approved outside the stake (First Presidency, Twelve, or a
   General Authority) or ones that don't need council approval in the first
   place.
4. **Interview Assigned** — a presidency member (or whoever the presidency
   designates) is assigned to interview the person and extend the calling.
5. **Interview / Calling Extended** — the interview happened and the
   calling was extended.
6. **Accepted** — the person accepted.
7. **Sustained** — see [Sustaining](#sustaining) below; can be combined
   with setting apart in one visit.
8. **Set Apart** — the person was set apart, and by whom.
9. **Recorded in LCR** — marking this finalizes the workflow straight
   through to **Complete** in the same step, since there's nothing left to
   do once LCR has it.
10. **Complete.**

A **release** is shorter — seven steps, and it skips both the high council
vote and the interview assignment, since an ordinary stake calling doesn't
go back through the council to be released:

**Proposed → Stake Presidency Approved → Release Extended → Released →
Sustained → Recorded in LCR → Complete**

Every workflow's detail page has a **History** section at the bottom
showing every status change, who made it, and when — a full audit trail
you can always scroll back through.

### High council voting

Once a calling reaches **Stake Presidency Approved**, and it's the kind of
calling that needs council approval, it opens for a vote. Each high
councilor acts individually — there's no single "cast the council's vote"
button, everyone registers their own position:

- **Approve** — tap once to arm it, tap again to confirm.
- **Withdraw my approval** — undo your approval, as long as the workflow is
  still at this step. Once it moves past this point, votes lock in.
- **Raise a concern** — flags the workflow without blocking anyone else's
  approval count. If you'd already approved, raising a concern replaces
  your approval (you can only hold one position at a time), and vice
  versa — approving instead clears a standing concern.

**A concern is not a veto.** It doesn't change how many approvals are
needed or counted, but it does stop the council from advancing the workflow
on its own — someone needs to talk it through with whoever raised it, or
clear it. The presidency can still advance a workflow with an open concern
if they judge it necessary; doing so is recorded in the history.

As a councilor, you'll see the running tally (e.g. "7 of 9 approvals") but
not who specifically hasn't voted yet — that's deliberate, so chasing down
stragglers stays a real conversation rather than something the app tracks
for you. The presidency additionally sees who has approved and who raised
a concern, by name.

### Sustaining

For a ward, branch, or elders quorum calling, sustaining happens once, in
that unit. For a **stake-level** calling (High Council, stake auxiliaries,
etc.) there's no single stake conference to sustain it at in this app's
model, so it's sustained **ward by ward** as the presidency or council
visits each unit — the workflow's detail page shows how many of the
stake's units have signed off so far, and lets you check off units as you
go.

The presidency can mark a stake-wide calling sustained even before every
unit has confirmed, if that's genuinely necessary — doing so leaves a clear
note in the history recording how many units had actually signed off at
the time, so it's never silent.

### Setting apart

Recorded from the calling's detail page (or from **Units**, on the Sunday
you're actually with that person — see below). If the same visit is both
sustaining someone and the last unit a stake-wide calling needed, the app
offers **Sustain & set apart** as one combined action; otherwise they're
two separate steps.

## Priesthood Advancements

Simpler than a calling — six steps, no interview or sustaining, since
there's no calling attached to an ordination:

**Proposed → Stake Presidency Approved → High Council Approved → Ordained →
Recorded in LCR → Complete**

The two advancement types are **Priest → Elder** and **Elder → High
Priest**. High council voting works exactly the same way as for callings
(see above). Recording who performed the ordination is a free-text field on
the detail page or the Units page — often a family member rather than
whoever happens to be recording it, so it's a deliberate name entry, not a
one-tap "I did it" button.

## Units — what to do this Sunday

Go to **Units**, and pick the ward or branch you're visiting. You'll see
four lists, filtered to just that unit and just what's ready to act on
today:

- **Needs sustaining** — callings and releases ready to be sustained there.
- **Releases** — releases ready for a vote of thanks.
- **Needs setting apart** — people ready to be set apart.
- **Ordinations pending** — priesthood advancements ready for ordination.

This page exists purely to answer "what do I do here today" — proposing
new callings, casting HC votes, and adding notes all still happen from the
Callings/Advancements pages themselves.

## Assignments — what's waiting on you (and the stake)

**Your assignments** shows what's personally waiting on you:

- **High Council votes** — proposals you as a councilor haven't yet
  approved or raised a concern on.
- **Interviews to conduct** — callings at the Interview Assigned step where
  you're the one assigned. (This matches by your name, so if you're
  assigned under a slightly different name than the one you're signed in
  under, it may not show up here — the assignment itself is still fine and
  visible to everyone from the Callings list.)

If you're the presidency, you'll also see **Outstanding across the
stake** — the whole picture, not just your own:

- **Proposed, awaiting your review** — everything newly proposed and not
  yet reviewed.
- **High Council votes** — every proposal currently open for a vote,
  stake-wide, with the running tally and who's approved or raised a
  concern.
- **Interview assignments** — every calling at the Interview Assigned step
  stake-wide, and who (if anyone) it's assigned to.

## Rolling back or deleting a workflow

Both are presidency-only, from a workflow's detail page:

- **Roll back** moves a workflow back exactly one step — useful if
  something was advanced by mistake. It's recorded in the history like any
  other change.
- **Delete this calling** removes the workflow entirely — for something
  created in error or duplicated. The history behind it is kept even after
  deletion, so the audit trail survives.

## Diagnostics

If the app seems stuck, won't load your data, or you're troubleshooting
from a meetinghouse network, open **Diagnostics** (reachable even while
signed out, linked from the sign-in screen) and run the connectivity
checks. It tells you plainly whether the app can reach Google sign-in and
Firestore, without needing any technical tools.

## Questions or access requests

There's no self-service way to change roles or add new users from inside
the app. If you need access, or your role needs to change, contact your
Stake Clerk or Admin directly.
