import { Component, computed, inject, signal } from '@angular/core';
import { Title } from '@angular/platform-browser';
import { Button } from '../button/button';
import { LocaleService } from '../i18n/locale.service';
import { TextField } from '../text-field/text-field';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Sign in with an email link: one field, checked on submit, and Enter sends it. */
@Component({
  selector: 'app-sign-in',
  imports: [Button, TextField],
  templateUrl: './sign-in.html',
})
export class SignIn {
  protected readonly locale = inject(LocaleService);
  protected readonly email = signal('');
  private readonly tried = signal(false);
  protected readonly sentTo = signal<string | null>(null);
  protected readonly error = computed(() => (this.tried() && !EMAIL.test(this.email().trim()) ? this.locale.t().emailError : undefined));

  constructor() {
    const t = this.locale.t();
    inject(Title).setTitle(`${t.signInTitle} · ${t.appName}`);
  }

  protected send(event: Event): void {
    event.preventDefault();
    this.tried.set(true);
    if (this.error()) return;
    this.sentTo.set(this.email().trim());
  }
}
