import type { Provider } from '@angular/core';
import { overrideStakeUnits } from '../units';
import { DEMO_UNITS } from './demo-units';
import { AuthService } from '../auth.service';
import { CallingsService } from '../callings.service';
import { PeopleService } from '../people.service';
import { DemoAuthService } from './demo-auth.service';
import { DemoCallingsService } from './demo-callings.service';
import { DemoPeopleService } from './demo-people.service';

const demoProviders: Provider[] = [
  { provide: AuthService, useClass: DemoAuthService },
  { provide: PeopleService, useClass: DemoPeopleService },
  { provide: CallingsService, useClass: DemoCallingsService },
];

/**
 * Switches the app over to mock data and returns the providers to bootstrap
 * with. Two things happen here:
 *
 *  - the real ward and branch vocabulary is replaced with invented units,
 *    so nothing on screen names a real unit; and
 *  - the three Firestore-backed services are replaced with in-memory
 *    equivalents at the root injector.
 *
 * Everything above them - the route guard, the components, the
 * calling-authorities rules - is untouched and runs exactly as it does
 * against a real project.
 *
 * This module is the entry point of the demo chunk: main.ts imports it
 * dynamically, and only when demo mode is actually active, so none of the
 * mock data reaches the initial bundle of a normal build. It must run
 * before bootstrap, because components read the unit vocabulary as they
 * render.
 */
export function installDemoMode(): Provider[] {
  overrideStakeUnits(DEMO_UNITS);
  return demoProviders;
}
