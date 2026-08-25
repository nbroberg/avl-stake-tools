import { Component, Input } from '@angular/core';

const PALETTE: Record<string, { bg: string; fg: string }> = {
  // Callings/releases - cool blues progressing to green as work completes.
  proposed: { bg: '#e4e9ee', fg: '#3c4a58' },
  presidency_review: { bg: '#dbe7f5', fg: '#1c3f60' },
  approved: { bg: '#d6ecff', fg: '#124a7a' },
  high_council_approval: { bg: '#fde6cc', fg: '#8a4a00' },
  assigned_to_be_extended: { bg: '#fdeecc', fg: '#8a6a00' },
  release_assigned: { bg: '#fdeecc', fg: '#8a6a00' },
  accepted: { bg: '#e3f3ea', fg: '#1f6b45' },
  sustaining_assigned: { bg: '#eaf3e3', fg: '#3a6b1f' },
  sustained: { bg: '#dff0e6', fg: '#1f6b45' },
  released: { bg: '#dff0e6', fg: '#1f6b45' },
  setting_apart_assigned: { bg: '#e6f0f8', fg: '#1c3f60' },
  set_apart: { bg: '#d7ecff', fg: '#124a7a' },
  recorded_in_lcr: { bg: '#e0e0f5', fg: '#3a3a8a' },
  complete: { bg: '#d7f0df', fg: '#1a5c34' },
  // Appointments
  scheduled: { bg: '#d6ecff', fg: '#124a7a' },
  completed: { bg: '#d7f0df', fg: '#1a5c34' },
  cancelled: { bg: '#f0e0e0', fg: '#8a2c22' },
  no_show: { bg: '#f7dede', fg: '#a3241a' },
};

const FALLBACK = { bg: '#e4e9ee', fg: '#3c4a58' };

@Component({
  selector: 'app-status-badge',
  standalone: true,
  template: `
    <span class="badge" [style.background]="colors.bg" [style.color]="colors.fg">
      {{ label }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input({ required: true }) status = '';
  @Input({ required: true }) label = '';

  get colors() {
    return PALETTE[this.status] ?? FALLBACK;
  }
}
