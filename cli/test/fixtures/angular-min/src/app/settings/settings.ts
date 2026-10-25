import { Component, signal } from '@angular/core';

@Component({
  selector: 'app-settings',
  template: `
    <main class="p-4">
      <h1 class="text-2xl font-bold">Settings</h1>
      <label><input type="checkbox" [checked]="alerts()" (change)="alerts.set(!alerts())" /> Alerts</label>
    </main>
  `,
})
export class Settings {
  protected readonly alerts = signal(true);
}
