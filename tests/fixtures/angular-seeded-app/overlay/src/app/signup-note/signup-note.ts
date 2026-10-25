import { animate, style, transition, trigger } from '@angular/animations';
import { Component, input } from '@angular/core';
import { Icon } from '../icon/icon';

/** The confirmation under a shift's actions. It fades into place. */
@Component({
  selector: 'app-signup-note',
  imports: [Icon],
  animations: [
    trigger('rise', [
      transition(':enter', [
        style({ opacity: 0 }),
        animate('250ms', style({ opacity: 1 })),
      ]),
    ]),
  ],
  template: `
    <div aria-live="polite">
      @if (show()) {
        <div class="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-md" @rise>
          <span class="flex size-8 shrink-0 items-center justify-center rounded-full bg-success text-on-success">
            <svg appIcon name="check"></svg>
          </span>
          <div class="flex flex-col gap-1">
            <p class="font-label text-label">{{ title() }}</p>
            @if (body()) {
              <p class="text-text-secondary">{{ body() }}</p>
            }
          </div>
        </div>
      }
    </div>
  `,
})
export class SignupNote {
  readonly show = input(false);
  readonly title = input.required<string>();
  readonly body = input<string>();
}
