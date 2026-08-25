import { ApplicationConfig } from '@angular/core';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';

/**
 * Angular v21+ is zoneless by default, so there is deliberately no
 * `provideZoneChangeDetection` here and no `zone.js` polyfill in angular.json.
 * Change detection is driven by signals, template event bindings, and the
 * async pipe - see the "Zoneless change detection" section of the README
 * before adding component state that isn't a signal.
 */
export const appConfig: ApplicationConfig = {
  providers: [provideRouter(routes)],
};
