import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { DemoBannerComponent } from './shared/demo-banner.component';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, DemoBannerComponent],
  // The banner sits above the outlet so it covers every route - including
  // /login and /diagnostics, which render outside the app shell. It renders
  // nothing at all when demo mode is off.
  template: `
    <app-demo-banner />
    <router-outlet />
  `,
})
export class AppComponent {}
