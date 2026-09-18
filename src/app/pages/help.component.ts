import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

/**
 * Plain-language "how do I use this thing" page, written for someone who
 * isn't especially technical - a stake presidency or high council member,
 * not a software person. Exact statuses, ordering rules, and edge cases
 * live on the Help Reference page instead (see HelpReferenceComponent),
 * linked from the bottom of this one, so this page can stay short.
 */
@Component({
  selector: 'app-help',
  standalone: true,
  imports: [RouterLink],
  template: `
    <div class="stack">
      <div>
        <h1 style="margin: 0 0 0.25rem">Help</h1>
        <p class="muted" style="margin: 0">
          Everything you need to use this app as a stake presidency or high council member.
        </p>
      </div>

      <div class="card stack home-screen">
        <h2 style="margin: 0">Add this app to your phone's Home Screen</h2>
        <p style="margin: 0">
          Once it's on your Home Screen, you open it with one tap - no need to remember the
          address or dig through your bookmarks.
        </p>
        <details>
          <summary>iPhone or iPad (Safari)</summary>
          <ol class="help-list">
            <li>
              Open this site in <strong>Safari</strong> - this option doesn't show up in Chrome or
              other browsers on an iPhone.
            </li>
            <li>
              Tap the <strong>Share</strong> button (the square with an arrow pointing up),
              usually along the bottom of the screen.
            </li>
            <li>Scroll down the menu that pops up and tap <strong>Add to Home Screen</strong>.</li>
            <li>Tap <strong>Add</strong> in the top right corner.</li>
          </ol>
        </details>
        <details>
          <summary>Android phone or tablet (Chrome)</summary>
          <ol class="help-list">
            <li>Open this site in <strong>Chrome</strong>.</li>
            <li>Tap the three dots (⋮) in the top right corner.</li>
            <li>
              Tap <strong>Add to Home screen</strong> (some phones show
              <strong>Install app</strong> instead).
            </li>
            <li>Tap <strong>Add</strong> (or <strong>Install</strong>) to confirm.</li>
          </ol>
        </details>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">What this app is for</h2>
        <p style="margin: 0">
          It keeps track of callings, releases, and priesthood advancements from start to
          finish - who's being called or released, who's approved it, whether it's been
          sustained, recorded with the stake, and set apart - so nothing falls through the cracks
          and everyone involved can see where things stand.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">What you can do</h2>
        <p style="margin: 0">
          <strong>Stake Presidency</strong> can create and manage every calling, release, and
          advancement from start to finish.
        </p>
        <p style="margin: 0">
          <strong>High Council</strong> members can see everything, vote to approve proposals, and
          record what happens during a Sunday visit - sustaining, releasing, setting apart, or
          ordaining someone in person.
        </p>
        <p class="muted text-sm" style="margin: 0">
          Your role is set up for you ahead of time - see Questions or access requests below if it
          looks wrong.
        </p>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Finding your way around</h2>
        <dl class="help-dl">
          <dt>Dashboard</dt>
          <dd>Your starting point after signing in - a quick look at what needs attention.</dd>
          <dt>Units</dt>
          <dd>Pick the ward or branch you're visiting this Sunday to see exactly what needs doing there.</dd>
          <dt>Assignments</dt>
          <dd>Everything currently waiting on you personally.</dd>
          <dt>Callings</dt>
          <dd>Every calling and release, from the first proposal through completion.</dd>
          <dt>Advancements</dt>
          <dd>Priesthood advancements - Priest to Elder, and Elder to High Priest.</dd>
        </dl>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Common questions</h2>
        <dl class="faq">
          <dt>How do I propose a new calling or release?</dt>
          <dd>
            From <strong>Callings</strong>, tap <strong>+ New</strong>, choose Calling or Release,
            and follow the prompts. (Presidency only.)
          </dd>
          <dt>How do I vote on a calling as high council?</dt>
          <dd>
            Open the calling from your <strong>Assignments</strong> page and tap Approve or Raise
            a concern.
          </dd>
          <dt>How do I mark someone sustained or set apart?</dt>
          <dd>
            Go to <strong>Units</strong>, pick the ward or branch you're visiting, and use the
            buttons next to their name.
          </dd>
          <dt>I made a mistake - can it be fixed?</dt>
          <dd>
            Yes. From the calling or release's own page, the presidency can roll it back one step,
            or delete it entirely if it was created by mistake.
          </dd>
        </dl>
      </div>

      <div class="card stack">
        <h2 style="margin: 0">Questions or access requests</h2>
        <p style="margin: 0">
          There's no way to change roles or add new users from inside the app. If you need access,
          or your role needs to change, contact your Stake Clerk or Admin directly.
        </p>
      </div>

      <p style="margin: 0">
        <a routerLink="/help/reference"
          >Looking for the technical details - every status and exact rule a calling, release, or
          advancement follows? See the Detailed Reference &rarr;</a
        >
      </p>
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
      /* Unlike help-dl's short labels, an FAQ question is a full sentence -
         always one column, question bold on its own line. */
      .faq {
        margin: 0;
        display: flex;
        flex-direction: column;
        gap: 0.15rem;
      }
      .faq dt {
        font-weight: 600;
        margin-top: 0.6rem;
      }
      .faq dt:first-of-type { margin-top: 0; }
      .faq dd { margin: 0; color: var(--text); }
      .help-list {
        margin: 0;
        padding-left: 1.25rem;
        display: flex;
        flex-direction: column;
        gap: 0.5rem;
      }
      .home-screen details {
        border: 1px solid var(--border);
        border-radius: 8px;
        padding: 0.6rem 0.75rem;
      }
      .home-screen details + details {
        margin-top: -0.25rem;
      }
      .home-screen summary {
        cursor: pointer;
        font-weight: 600;
      }
      .home-screen details[open] summary {
        margin-bottom: 0.5rem;
      }
    `,
  ],
})
export class HelpComponent {}
