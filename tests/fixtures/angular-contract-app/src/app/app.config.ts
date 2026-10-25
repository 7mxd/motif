import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideRouter, withComponentInputBinding } from '@angular/router';

import { routes } from './app.routes';
import { LocaleService } from './i18n/locale.service';
import { VariantService } from './variant.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding()),
    // The language, direction and variant on <html> before the first page is drawn.
    provideAppInitializer(() => {
      inject(LocaleService);
      inject(VariantService);
    }),
  ],
};
