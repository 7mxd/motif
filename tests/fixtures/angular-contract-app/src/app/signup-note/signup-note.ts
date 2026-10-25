import { Component, input } from '@angular/core';
import { Icon } from '../icon/icon';

/**
 * The confirmation under a shift's actions. It rises into place with animate.enter, timed by the motion roles;
 * motif.css's reduced-motion rule stops the animation, so with reduced motion it simply appears.
 */
@Component({
  selector: 'app-signup-note',
  imports: [Icon],
  template: `
    <div aria-live="polite">
      @if (show()) {
        <div class="flex items-start gap-3 rounded-lg border border-border bg-surface-raised p-4 shadow-md" animate.enter="rise-in">
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
  styles: `
    .rise-in {
      animation: rise var(--motif-duration-base) var(--motif-easing-enter);
    }
    @keyframes rise {
      from {
        opacity: 0;
        transform: translateY(var(--motif-space-3));
      }
    }
  `,
})
export class SignupNote {
  readonly show = input(false);
  readonly title = input.required<string>();
  readonly body = input<string>();
}
