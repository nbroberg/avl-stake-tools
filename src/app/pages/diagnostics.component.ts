import { Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { doc, getDoc, serverTimestamp, setDoc } from 'firebase/firestore';
import { db, firebaseConfigIsPresent } from '../core/firebase';
import { AuthService } from '../core/auth.service';

type CheckResult = 'idle' | 'running' | 'pass' | 'fail';

interface Check {
  id: string;
  label: string;
  detail: string;
  result: CheckResult;
}

function initialChecks(): Check[] {
  return [
    { id: 'config', label: 'Firebase config loaded', detail: '', result: 'idle' },
    { id: 'auth', label: 'Firebase Authentication (signed in)', detail: '', result: 'idle' },
    {
      id: 'write',
      label: 'Firestore authenticated write',
      detail: 'Writes to diagnostics/{your uid}, a doc only you can read/write.',
      result: 'idle',
    },
    {
      id: 'read',
      label: 'Firestore authenticated read',
      detail: 'Reads back the doc just written.',
      result: 'idle',
    },
    {
      id: 'rulesReject',
      label: 'Firestore rules reject unauthorized reads',
      detail:
        "Tries to read the callingWorkflows collection. If you're not an approved app user yet, this should FAIL with permission-denied - that's a pass for this check.",
      result: 'idle',
    },
  ];
}

const RESULT_STYLE: Record<CheckResult, { label: string; bg: string; fg: string }> = {
  idle: { label: 'Not run', bg: '#e4e9ee', fg: '#5b6b78' },
  running: { label: 'Running…', bg: '#dbe7f5', fg: '#1c3f60' },
  pass: { label: 'Pass', bg: '#d7f0df', fg: '#1a5c34' },
  fail: { label: 'Fail', bg: '#f7dede', fg: '#a3241a' },
};

/**
 * Developer/diagnostic page. Purpose-built to answer, from a meetinghouse
 * network with a laptop or phone: is the JS bundle loading, is Firebase Auth
 * reachable, and is Firestore reachable for both reads and writes - without
 * needing devtools. Linked from the login screen so it's reachable even
 * signed out (this route has no auth guard).
 */
@Component({
  selector: 'app-diagnostics',
  standalone: true,
  imports: [RouterLink],
  styles: [
    `
      .diagnostics {
        /* No app header above this route, so clear the status bar directly. */
        padding-top: max(1rem, env(safe-area-inset-top));
      }
      .back {
        display: inline-flex;
        align-items: center;
        min-height: var(--tap);
        font-weight: 600;
        text-decoration: none;
      }
    `,
  ],
  template: `
    <div class="page diagnostics stack">
      <!-- This route sits outside the app shell (it must work signed out), so
           it carries its own way back rather than stranding a phone user with
           no nav bar. -->
      <a class="back" routerLink="/">&larr; Back to app</a>
      <h1>Diagnostics</h1>
      <p class="muted text-sm">
        Use this page from the meetinghouse network to confirm the app can reach Firebase
        Authentication and Cloud Firestore before troubleshooting anything else.
      </p>

      <div class="card stack">
        <div class="row-between">
          <strong>Auth status</strong>
          <span class="text-sm muted">{{ authService.status() }}</span>
        </div>
        @if (authService.appUser(); as user) {
          <div class="text-sm muted">
            App role: <strong>{{ user.role }}</strong> ({{ user.active ? 'active' : 'inactive' }})
          </div>
        }
      </div>

      <button class="btn btn-primary btn-responsive" (click)="runChecks()" [disabled]="running()">
        {{ running() ? 'Running checks…' : 'Run connectivity checks' }}
      </button>

      <div class="stack">
        @for (c of checks(); track c.id) {
          <div class="card">
            <div class="row-between">
              <strong>{{ c.label }}</strong>
              <span class="badge" [style.background]="resultStyle[c.result].bg" [style.color]="resultStyle[c.result].fg">
                {{ resultStyle[c.result].label }}
              </span>
            </div>
            @if (c.detail) {
              <p class="text-sm muted" style="margin-bottom: 0">{{ c.detail }}</p>
            }
          </div>
        }
      </div>
    </div>
  `,
})
export class DiagnosticsComponent {
  protected readonly authService = inject(AuthService);
  protected readonly resultStyle = RESULT_STYLE;

  protected readonly checks = signal<Check[]>(initialChecks());
  protected readonly running = signal(false);

  private setCheck(id: string, patch: Partial<Check>): void {
    this.checks.update((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  async runChecks(): Promise<void> {
    this.running.set(true);
    this.checks.set(initialChecks());

    this.setCheck('config', {
      result: firebaseConfigIsPresent ? 'pass' : 'fail',
      detail: firebaseConfigIsPresent
        ? 'Firebase environment values are present in this build.'
        : 'Missing Firebase config values - check GitLab CI/CD variables or .env.local.',
    });

    const firebaseUser = this.authService.firebaseUser();
    this.setCheck('auth', {
      result: firebaseUser ? 'pass' : 'fail',
      detail: firebaseUser
        ? `Signed in as ${firebaseUser.email} (uid: ${firebaseUser.uid})`
        : 'Not signed in. Sign in with Google to run the Firestore checks.',
    });

    if (firebaseUser) {
      try {
        const ref = doc(db, 'diagnostics', firebaseUser.uid);
        await setDoc(ref, {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          pingedAt: serverTimestamp(),
          userAgent: navigator.userAgent,
        });
        this.setCheck('write', { result: 'pass', detail: 'Write to diagnostics/{uid} succeeded.' });

        try {
          const snap = await getDoc(ref);
          this.setCheck('read', {
            result: snap.exists() ? 'pass' : 'fail',
            detail: snap.exists()
              ? 'Read back the diagnostic doc successfully.'
              : 'Read succeeded but document was missing.',
          });
        } catch (err) {
          this.setCheck('read', { result: 'fail', detail: describeError(err) });
        }
      } catch (err) {
        this.setCheck('write', { result: 'fail', detail: describeError(err) });
        this.setCheck('read', { result: 'fail', detail: 'Skipped - write failed.' });
      }

      try {
        await getDoc(doc(db, 'callingWorkflows', '__diagnostics_probe__'));
        this.setCheck('rulesReject', {
          result: 'pass',
          detail:
            'Read was allowed - your account is authorized staff, so this correctly did not get rejected.',
        });
      } catch (err) {
        const denied = describeError(err).toLowerCase().includes('permission');
        this.setCheck('rulesReject', {
          result: denied ? 'pass' : 'fail',
          detail: denied
            ? 'Correctly rejected with permission-denied, as expected for an unauthorized account.'
            : describeError(err),
        });
      }
    } else {
      this.setCheck('write', { result: 'fail', detail: 'Skipped - not signed in.' });
      this.setCheck('read', { result: 'fail', detail: 'Skipped - not signed in.' });
      this.setCheck('rulesReject', { result: 'fail', detail: 'Skipped - not signed in.' });
    }

    this.running.set(false);
  }
}

function describeError(err: unknown): string {
  if (err instanceof Error) return err.message;
  return String(err);
}
