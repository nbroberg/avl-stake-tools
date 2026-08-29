import { Component, computed, inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { RouterLink } from '@angular/router';
import { AuthService } from '../core/auth.service';
import { CallingsService } from '../core/callings.service';
import { PriesthoodAdvancementsService } from '../core/priesthood-advancements.service';
import { awaitsResponseFrom } from '../core/hc-review';
import { awaitsResponseFrom as awaitsAdvancementResponseFrom } from '../core/advancement-review';
import { isHighCouncil } from '../core/roles';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink],
  styles: [
    `
      .call-to-action {
        display: block;
        padding: 0.9rem;
        border-radius: 10px;
        border: 1px solid var(--primary);
        border-left-width: 4px;
        background: var(--surface);
        text-decoration: none;
        color: inherit;
      }
      .cta-count {
        font-size: 1.6rem;
        font-weight: 600;
        color: var(--primary);
        line-height: 1.1;
      }
    `,
  ],
  template: `
    <div class="stack">
      <h1 style="margin-bottom: 0">
        Welcome{{ authService.appUser() ? ', ' + authService.appUser()!.displayName : '' }}
      </h1>

      <!-- A high councilor signing in has one question: what needs me? Answer
           it before the generic navigation, and say so plainly when the
           answer is "nothing". -->
      @if (isHighCouncil(authService.appUser())) {
        @if (awaitingCount() > 0) {
          <a class="call-to-action" routerLink="/callings">
            <div class="cta-count">{{ awaitingCount() }}</div>
            <strong>
              {{ awaitingCount() === 1 ? 'proposal awaits' : 'proposals await' }} your response
            </strong>
            <div class="muted text-sm">
              Review and record your approval, or raise a concern.
            </div>
          </a>
        }
        @if (awaitingAdvancementCount() > 0) {
          <a class="call-to-action" routerLink="/advancements">
            <div class="cta-count">{{ awaitingAdvancementCount() }}</div>
            <strong>
              priesthood {{ awaitingAdvancementCount() === 1 ? 'advancement awaits' : 'advancements await' }}
              your response
            </strong>
            <div class="muted text-sm">
              Review and record your approval, or raise a concern.
            </div>
          </a>
        }
        @if (awaitingCount() === 0 && awaitingAdvancementCount() === 0) {
          <p class="muted">Nothing is waiting on your approval right now.</p>
        }
      } @else {
        <p class="muted">Pick a workflow to get started.</p>
      }

      <div class="stack">
        <a class="list-item" routerLink="/callings">
          <strong>Callings &amp; Sustainings</strong>
          <div class="muted text-sm">Track proposed callings and releases through completion.</div>
        </a>
        <a class="list-item" routerLink="/advancements">
          <strong>Priesthood Advancements</strong>
          <div class="muted text-sm">Track Priest→Elder and Elder→High Priest approvals.</div>
        </a>
        <a class="list-item" routerLink="/scope">
          <strong>Stake Scope</strong>
          <div class="muted text-sm">Who currently holds each stake, bishopric and EQ calling.</div>
        </a>
        <a class="list-item" routerLink="/people">
          <strong>Roster</strong>
          <div class="muted text-sm">Import from LCR and browse local Person records.</div>
        </a>
        <a class="list-item" routerLink="/diagnostics">
          <strong>Diagnostics</strong>
          <div class="muted text-sm">Check Firebase Auth and Firestore connectivity.</div>
        </a>
      </div>
    </div>
  `,
})
export class DashboardComponent {
  protected readonly authService = inject(AuthService);
  protected readonly isHighCouncil = isHighCouncil;

  private readonly callingsService = inject(CallingsService);
  private readonly workflows = toSignal(this.callingsService.listWorkflows(), {
    initialValue: [],
  });

  private readonly advancementsService = inject(PriesthoodAdvancementsService);
  private readonly advancementWorkflows = toSignal(this.advancementsService.listWorkflows(), {
    initialValue: [],
  });

  protected readonly awaitingCount = computed(() => {
    const user = this.authService.appUser();
    return this.workflows().filter((w) => awaitsResponseFrom(w, user)).length;
  });

  protected readonly awaitingAdvancementCount = computed(() => {
    const user = this.authService.appUser();
    return this.advancementWorkflows().filter((w) => awaitsAdvancementResponseFrom(w, user))
      .length;
  });
}
