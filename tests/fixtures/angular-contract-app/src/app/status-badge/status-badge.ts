import { Component, computed, inject, input } from '@angular/core';
import { LocaleService } from '../i18n/locale.service';
import type { ShiftStatus } from '../mock-data';

/** Whether a shift has room: a word beside the colour, always, so the colour alone never says it. */
@Component({
  selector: 'app-status-badge',
  template: `<span class="badge" [class]="'badge-' + status()"><span class="dot" aria-hidden="true"></span>{{ label() }}</span>`,
  styles: `
    .badge {
      display: inline-flex;
      align-items: center;
      gap: var(--motif-space-2);
      padding-block: var(--motif-space-1);
      padding-inline: var(--motif-space-2);
      border: 1px solid transparent;
      border-radius: var(--motif-radius-sm);
      font-family: var(--motif-font-label-family);
      font-size: var(--motif-font-caption-size);
      font-weight: var(--motif-font-label-weight);
      line-height: var(--motif-font-caption-line-height);
      white-space: nowrap;
    }
    .dot {
      inline-size: var(--motif-space-2);
      block-size: var(--motif-space-2);
      border-radius: var(--motif-radius-full);
      background: currentColor;
    }
    .badge-open {
      background: var(--motif-color-success);
      color: var(--motif-color-on-success);
    }
    .badge-few {
      background: var(--motif-color-warning);
      color: var(--motif-color-on-warning);
    }
    .badge-full {
      border-color: var(--motif-color-border);
      color: var(--motif-color-text-secondary);
    }
  `,
})
export class StatusBadge {
  readonly status = input.required<ShiftStatus>();
  private readonly locale = inject(LocaleService);
  protected readonly label = computed(() => {
    const t = this.locale.t();
    return { open: t.statusOpen, few: t.statusFew, full: t.statusFull }[this.status()];
  });
}
