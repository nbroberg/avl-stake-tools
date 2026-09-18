import { Component, Input } from '@angular/core';

const PALETTE: Record<string, { bg: string; fg: string }> = {
  // Callings/releases - cool blues progressing to green as work completes.
  proposed: { bg: 'var(--badge-neutral-bg, #e4e9ee)', fg: 'var(--badge-neutral-fg, #3c4a58)' },
  presidency_review: { bg: 'var(--badge-navy-bg, #dbe7f5)', fg: 'var(--badge-navy-fg, #1c3f60)' },
  approved: { bg: 'var(--badge-blue-bg, #d6ecff)', fg: 'var(--badge-blue-fg, #124a7a)' },
  high_council_approval: { bg: 'var(--badge-orange-bg, #fde6cc)', fg: 'var(--badge-orange-fg, #8a4a00)' },
  assigned_to_be_extended: { bg: 'var(--badge-amber-bg, #fdeecc)', fg: 'var(--badge-amber-fg, #8a6a00)' },
  release_assigned: { bg: 'var(--badge-amber-bg, #fdeecc)', fg: 'var(--badge-amber-fg, #8a6a00)' },
  accepted: { bg: 'var(--badge-mint-bg, #e3f3ea)', fg: 'var(--badge-mint-fg, #1f6b45)' },
  sustaining_assigned: { bg: 'var(--badge-olive-bg, #eaf3e3)', fg: 'var(--badge-olive-fg, #3a6b1f)' },
  sustained: { bg: 'var(--badge-green-bg, #dff0e6)', fg: 'var(--badge-green-fg, #1f6b45)' },
  released: { bg: 'var(--badge-green-bg, #dff0e6)', fg: 'var(--badge-green-fg, #1f6b45)' },
  setting_apart_assigned: { bg: 'var(--badge-navy-pale-bg, #e6f0f8)', fg: 'var(--badge-navy-pale-fg, #1c3f60)' },
  set_apart: { bg: 'var(--badge-blue-alt-bg, #d7ecff)', fg: 'var(--badge-blue-alt-fg, #124a7a)' },
  recorded_in_lcr: { bg: 'var(--badge-indigo-bg, #e0e0f5)', fg: 'var(--badge-indigo-fg, #3a3a8a)' },
  complete: { bg: 'var(--badge-green-deep-bg, #d7f0df)', fg: 'var(--badge-green-deep-fg, #1a5c34)' },
  // Appointments
  scheduled: { bg: 'var(--badge-blue-bg, #d6ecff)', fg: 'var(--badge-blue-fg, #124a7a)' },
  completed: { bg: 'var(--badge-green-deep-bg, #d7f0df)', fg: 'var(--badge-green-deep-fg, #1a5c34)' },
  cancelled: { bg: 'var(--badge-red-soft-bg, #f0e0e0)', fg: 'var(--badge-red-soft-fg, #8a2c22)' },
  no_show: { bg: 'var(--badge-red-bg, #f7dede)', fg: 'var(--badge-red-fg, #a3241a)' },
};

const FALLBACK = { bg: 'var(--badge-neutral-bg, #e4e9ee)', fg: 'var(--badge-neutral-fg, #3c4a58)' };

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
