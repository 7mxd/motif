import { Component, signal } from '@angular/core';
import { strings } from '../strings';

@Component({
  selector: 'app-settings',
  template: `
    <main class="flex flex-col gap-4 p-4">
      <h1 class="font-title text-title">{{ t.settings }}</h1>
      <label class="flex flex-col gap-2">
        <span class="font-label text-label">{{ t.name }}</span>
        <input [value]="name()" (input)="name.set($any($event.target).value)" class="rounded-md border border-border bg-surface p-3 text-text-primary" />
      </label>
      @if (name()) {
        <p class="text-text-secondary">{{ t.hello }} {{ name() }}</p>
      }
    </main>
  `,
})
export class Settings {
  protected readonly t = strings;
  protected readonly name = signal('');
}
