import { Component } from '@angular/core';

/**
 * In-app "how do I use this thing" reference - the live counterpart to
 * docs/user-guide.md in the repo. Kept as a plain authenticated page (not
 * fetched from the markdown file at runtime) so it works offline and needs
 * no markdown renderer; keep the two in sync by hand when either changes.
 */
@Component({
  selector: 'app-help',
  standalone: true,
  template: `
    <div class="stack">
      <div>
        <h1 style="margin: 0 0 0.25rem">Help</h1>
        <p class="muted" style="margin: 0">
          How to use this app as a stake presidency or high council member.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Roles</h2>
        <p>
          <strong>Stake Presidency</strong> — full access: create and edit any calling, release,
          or priesthood advancement; delete a workflow created in error; advance or roll back any
          step; override sustaining requirements when needed.
        </p>
        <p style="margin: 0">
          <strong>High Council</strong> — can see everything, but can only act at specific points:
          casting a vote (approve or raise a concern) once a proposal reaches Stake Presidency
          Approved, and recording what happens during a Sunday visit to a unit — sustaining,
          releasing, setting apart, or ordaining, in person.
        </p>
        <p class="muted text-sm" style="margin: 0">
          Your role is set by whoever administers the app for your stake — there's no way to
          change your own role or anyone else's from inside the app.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Getting around</h2>
        <dl class="help-dl">
          <dt>Dashboard</dt>
          <dd>Your starting point after signing in.</dd>
          <dt>Units</dt>
          <dd>Pick the ward or branch you're visiting this Sunday to see what needs doing there.</dd>
          <dt>Assignments</dt>
          <dd>Everything currently waiting on you, and — for the presidency — everything waiting stake-wide.</dd>
          <dt>Callings</dt>
          <dd>Every calling and release workflow, from proposal through completion.</dd>
          <dt>Advancements</dt>
          <dd>Priest → Elder and Elder → High Priest workflows.</dd>
        </dl>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Proposing a calling or release</h2>
        <p class="muted text-sm" style="margin: 0">Presidency only, from Callings → + New.</p>
        <ol class="help-list">
          <li>Choose <strong>New Calling</strong> or <strong>Release</strong>.</li>
          <li>
            Pick the calling. For a release, the dropdown only lists callings someone currently
            holds — you can't release from an empty seat.
          </li>
          <li>
            For a ward, branch, or elders quorum calling, pick the unit — this narrows the person
            list to that unit. Stake-level callings have no unit to pick.
          </li>
          <li>
            If a single-seat calling is already filled, you'll see who holds it with a
            <strong>Release ↗</strong> link that opens a release for them in a new tab.
          </li>
          <li>
            Search for and select the person. The list is filtered to who qualifies (priesthood
            office, an existing calling where one's normally required, etc.) — a note explains
            what's filtering the list.
          </li>
          <li>Optionally add notes, then <strong>Create</strong>.</li>
        </ol>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">The calling lifecycle</h2>
        <p style="margin: 0">
          A new calling moves through these steps in order — nothing skipped, apart from the
          presidency's override abilities noted below:
        </p>
        <ol class="help-list">
          <li><strong>Proposed</strong> — created by the presidency.</li>
          <li><strong>Stake Presidency Approved</strong> — the presidency's own sign-off.</li>
          <li>
            <strong>High Council Approved</strong> — reached once enough councilors approve (see
            High council voting below). Skipped for callings approved outside the stake, or ones
            that don't need council approval.
          </li>
          <li><strong>Interview Assigned</strong> — someone is assigned to interview the person and extend the calling.</li>
          <li><strong>Interview / Calling Extended</strong> — the interview happened and the calling was extended.</li>
          <li><strong>Accepted</strong> — the person accepted.</li>
          <li><strong>Sustained</strong> — see Sustaining below; can combine with setting apart in one visit.</li>
          <li><strong>Set Apart</strong> — the person was set apart, and by whom.</li>
          <li><strong>Recorded in LCR</strong> — finalizes straight through to Complete in the same step.</li>
          <li><strong>Complete.</strong></li>
        </ol>
        <p style="margin: 0">
          A <strong>release</strong> is shorter and skips both the high council vote and the
          interview assignment:
        </p>
        <p class="muted" style="margin: 0">
          Proposed → Stake Presidency Approved → Release Extended → Released → Sustained →
          Recorded in LCR → Complete
        </p>
        <p class="text-sm muted" style="margin: 0">
          Every workflow's detail page has a History section at the bottom showing every status
          change, who made it, and when.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">High council voting</h2>
        <p style="margin: 0">
          Once a calling reaches Stake Presidency Approved (and needs council approval), it opens
          for a vote. Each councilor acts individually:
        </p>
        <dl class="help-dl">
          <dt>Approve</dt>
          <dd>Tap once to arm it, tap again to confirm.</dd>
          <dt>Withdraw my approval</dt>
          <dd>Undo your approval, as long as the workflow hasn't advanced past this step yet.</dd>
          <dt>Raise a concern</dt>
          <dd>
            Flags the workflow without blocking anyone else's approval count. You can only hold
            one position at a time — approving clears a standing concern and vice versa.
          </dd>
        </dl>
        <p style="margin: 0">
          <strong>A concern is not a veto.</strong> It doesn't change how many approvals are
          needed, but it does stop the council from advancing the workflow on its own until it's
          talked through or cleared. The presidency can still advance a workflow with an open
          concern if genuinely necessary — that's recorded in the history.
        </p>
        <p class="text-sm muted" style="margin: 0">
          You'll see the running tally (e.g. "7 of 9 approvals") but not who specifically hasn't
          voted yet — that's deliberate, so chasing stragglers stays a real conversation. The
          presidency additionally sees who approved and who raised a concern, by name.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Sustaining and setting apart</h2>
        <p style="margin: 0">
          A ward, branch, or elders quorum calling is sustained once, in that unit. A
          <strong>stake-level</strong> calling has no single stake conference to sustain it at in
          this app's model, so it's sustained ward by ward as the presidency or council visits
          each unit — the detail page shows how many units have signed off so far.
        </p>
        <p style="margin: 0">
          The presidency can mark a stake-wide calling sustained even before every unit confirms,
          if genuinely necessary — doing so leaves a note recording how many units had actually
          signed off at the time.
        </p>
        <p class="text-sm muted" style="margin: 0">
          Setting apart is recorded from the calling's detail page, or from Units on the Sunday
          you're actually with the person. If the same visit both sustains someone and completes a
          stake-wide calling's sustaining, the app offers "Sustain &amp; set apart" as one combined
          action.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Priesthood Advancements</h2>
        <p style="margin: 0">
          Simpler than a calling — no interview or sustaining, since there's no calling attached
          to an ordination:
        </p>
        <p class="muted" style="margin: 0">
          Proposed → Stake Presidency Approved → High Council Approved → Ordained → Recorded in
          LCR → Complete
        </p>
        <p class="text-sm muted" style="margin: 0">
          The two types are Priest → Elder and Elder → High Priest. High council voting works the
          same way as for callings. Who performed the ordination is a free-text entry — often a
          family member rather than whoever's recording it.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Units — what to do this Sunday</h2>
        <p style="margin: 0">
          Pick the ward or branch you're visiting to see four lists, filtered to just what's ready
          to act on today: <strong>Needs sustaining</strong>, <strong>Releases</strong>,
          <strong>Needs setting apart</strong>, and <strong>Ordinations pending</strong>. Proposing
          new callings, casting HC votes, and adding notes still happen from the
          Callings/Advancements pages themselves.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Assignments — what's waiting on you</h2>
        <p style="margin: 0">
          <strong>Your assignments</strong> shows High Council votes you personally owe a response
          on, and interviews you're assigned to conduct.
        </p>
        <p style="margin: 0">
          If you're the presidency, <strong>Outstanding across the stake</strong> additionally
          shows everything newly proposed and awaiting review, every open High Council vote
          stake-wide with the running tally, and every interview assignment stake-wide.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Rolling back or deleting a workflow</h2>
        <p style="margin: 0">
          Both are presidency-only, from a workflow's detail page. <strong>Roll back</strong>
          moves a workflow back exactly one step. <strong>Delete</strong> removes the workflow
          entirely, for something created in error — its history is kept even after deletion, so
          the audit trail survives.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Questions or access requests</h2>
        <p style="margin: 0">
          There's no self-service way to change roles or add new users from inside the app. If you
          need access, or your role needs to change, contact your Stake Clerk or Admin directly.
        </p>
      </div>
    </div>
  `,
  styles: [
    `
      .help-dl {
        margin: 0;
        display: grid;
        grid-template-columns: max-content 1fr;
        gap: 0.35rem 1rem;
      }
      .help-dl dt {
        font-weight: 600;
        white-space: nowrap;
      }
      .help-dl dd {
        margin: 0;
        color: var(--text);
      }
      @media (max-width: 639.98px) {
        .help-dl {
          grid-template-columns: 1fr;
          gap: 0.1rem 0;
        }
        .help-dl dd {
          margin-bottom: 0.5rem;
        }
      }
      .help-list {
        margin: 0;
        padding-left: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
    `,
  ],
})
export class HelpComponent {}
