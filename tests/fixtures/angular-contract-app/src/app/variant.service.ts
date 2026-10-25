import { DOCUMENT, Injectable, REQUEST, inject, signal } from '@angular/core';
import { harvestDrive } from './mock-data';

const VARIANT = /^[a-z0-9-]+$/;

/**
 * The design variant on <html> (DESIGN.md, Variants): a choice saved in the variant cookie, else the food bank's
 * calendar, Harvest night during the harvest drive. Started with the app (app.config.ts), so the first page is drawn in it.
 */
@Injectable({ providedIn: 'root' })
export class VariantService {
  private readonly document = inject(DOCUMENT);
  private readonly request = inject(REQUEST, { optional: true });
  readonly variant = signal<string | null>(this.saved() ?? (harvestDrive ? 'harvest-night' : null));

  constructor() {
    this.apply(this.variant());
  }

  choose(variant: string | null): void {
    this.variant.set(variant);
    this.apply(variant);
    this.document.cookie = variant
      ? `variant=${variant}; path=/; max-age=31536000; samesite=lax`
      : 'variant=; path=/; max-age=0';
  }

  private apply(variant: string | null): void {
    const html = this.document.documentElement;
    if (variant) html.setAttribute('data-variant', variant);
    else html.removeAttribute('data-variant');
  }

  /** The saved variant, from the request's cookies on the server and the page's in the browser. A cookie is the visitor's text, so check it. */
  private saved(): string | null {
    const cookies = this.request?.headers.get('cookie') ?? this.document.cookie ?? '';
    const value = /(?:^|;\s*)variant=([^;]*)/.exec(cookies)?.[1] ?? '';
    return VARIANT.test(value) ? value : null;
  }
}
