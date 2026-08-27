import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

/**
 * Angular v21+ is zoneless by default, so there is deliberately no
 * `provideZoneChangeDetection` here and no `zone.js` polyfill in angular.json.
 * Change detection is driven by signals, template event bindings, and the
 * async pipe - see the "Zoneless change detection" section of the README
 * before adding component state that isn't a signal.
 *
 * Demo mode's service overrides are appended in main.ts rather than here,
 * so the mock data stays in a lazily-loaded chunk - see core/demo/demo-mode.ts.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)],
};
