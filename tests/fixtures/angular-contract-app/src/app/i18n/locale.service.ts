import { DOCUMENT, Injectable, computed, inject, signal } from '@angular/core';
import { ar, en, formats, langOf, type Lang } from './strings';

const FORMATS = { en: formats('en'), ar: formats('ar') };

/**
 * The page's language, from the browser's, with its words and formats. It writes lang and dir on <html> through
 * Angular's DOCUMENT as the app starts (app.config.ts), so Arabic reads right to left from the first page.
 */
@Injectable({ providedIn: 'root' })
export class LocaleService {
  private readonly document = inject(DOCUMENT);
  readonly lang = signal<Lang>(langOf(this.document.defaultView?.navigator.language));
  readonly t = computed(() => (this.lang() === 'ar' ? ar : en));
  readonly f = computed(() => FORMATS[this.lang()]);

  constructor() {
    const html = this.document.documentElement;
    html.setAttribute('lang', this.lang());
    html.setAttribute('dir', this.lang() === 'ar' ? 'rtl' : 'ltr');
  }
}
