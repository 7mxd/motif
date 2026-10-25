import { Component, input } from '@angular/core';
import { Icon, type IconName } from '../icon/icon';

/** Nothing here yet, or nothing found: a title, one line and one action (projected). */
@Component({
  selector: 'app-empty-state',
  imports: [Icon],
  template: `
    <div class="flex flex-col items-center gap-4 rounded-lg border border-dashed border-border px-6 py-10 text-center">
      <span class="flex size-12 items-center justify-center rounded-full bg-action-secondary text-on-action-secondary">
        <svg appIcon [name]="icon()"></svg>
      </span>
      <div class="flex max-w-sm flex-col gap-2">
        @if (level() === 'h1') {
          <h1 class="font-title text-title">{{ title() }}</h1>
        } @else {
          <h2 class="font-heading text-heading">{{ title() }}</h2>
        }
        <p class="text-text-secondary">{{ body() }}</p>
      </div>
      <ng-content />
    </div>
  `,
})
export class EmptyState {
  readonly title = input.required<string>();
  readonly body = input.required<string>();
  readonly icon = input<IconName>('basket');
  readonly level = input<'h1' | 'h2'>('h2');
}
