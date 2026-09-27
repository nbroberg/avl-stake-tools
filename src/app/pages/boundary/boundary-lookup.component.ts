import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoundaryService, type UnitBoundary } from '../../core/boundary.service';
import { GeocodingService, GeocodingError, type Coordinates } from '../../core/geocoding.service';

const MEETINGHOUSE_LOCATOR_URL = 'https://maps.churchofjesuschrist.org/';

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'result'; unit: UnitBoundary }
  | { kind: 'not-found' }
  | { kind: 'outside-stake' }
  | { kind: 'error'; message: string };

/**
 * Public, unauthenticated "which ward/branch is my address in" tool -
 * see app.routes.ts, where this is listed among the routes that never
 * go through authGuard. Built for the window right after a boundary
 * realignment, when the Church's own Meetinghouse Locator may not have
 * caught up yet (see the help text below the result).
 *
 * Deliberately does not touch Firestore, AuthService, or anything else
 * that implies a signed-in member: geocoding goes straight from the
 * browser to Google's API (see GeocodingService), the boundary check is
 * a local GeoJSON lookup (see BoundaryService), and neither the address
 * typed in nor the resolved coordinates are persisted anywhere - this
 * component holds them in a signal for the current page view only.
 */
@Component({
  selector: 'app-boundary-lookup',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="center-screen">
      <div class="card stack" style="max-width: 480px; width: 100%">
        <div>
          <h1 style="margin: 0 0 0.35rem">Find Your Ward or Branch</h1>
          <p class="muted text-sm" style="margin: 0">
            Enter your home address to see which congregation you are assigned to under the
            current Asheville North Carolina Stake boundaries.
          </p>
        </div>

        <div class="field">
          <label for="boundary-address">Street address</label>
          <input
            id="boundary-address"
            type="text"
            placeholder="123 Example Road, Asheville, NC 28803"
            [ngModel]="address()"
            (ngModelChange)="address.set($event)"
            (keydown.enter)="findMyUnit()"
            name="address"
            autocomplete="street-address"
          />
        </div>

        <div class="row">
          <button
            type="button"
            class="btn btn-primary btn-responsive"
            [disabled]="busy() || !address().trim()"
            (click)="findMyUnit()"
          >
            Find My Unit
          </button>
          @if (supportsGeolocation) {
            <button
              type="button"
              class="btn btn-responsive"
              [disabled]="busy()"
              (click)="useMyLocation()"
            >
              Use My Current Location
            </button>
          }
        </div>

        @if (state(); as s) {
          @if (s.kind === 'loading') {
            <p class="text-sm muted" style="margin: 0">Finding your unit…</p>
          } @else if (s.kind === 'result') {
            <div class="card stack" style="background: var(--bg)">
              <div>
                <p class="text-sm muted" style="margin: 0">Your unit is:</p>
                <h2 style="margin: 0.1rem 0 0">{{ s.unit.unitName }}</h2>
              </div>
              @if (s.unit.meetingTime || s.unit.meetinghouseAddress) {
                <div class="text-sm">
                  @if (s.unit.meetingTime) {
                    <p style="margin: 0">Sunday: {{ s.unit.meetingTime }}</p>
                  }
                  @if (s.unit.meetinghouseName || s.unit.meetinghouseAddress) {
                    <p style="margin: 0">
                      Meetinghouse:
                      {{ s.unit.meetinghouseName ? s.unit.meetinghouseName + ' — ' : '' }}
                      {{ s.unit.meetinghouseAddress }}
                    </p>
                  }
                </div>
              }
              @if (mapsUrl(s.unit); as url) {
                <a class="btn btn-responsive" [href]="url" target="_blank" rel="noopener">
                  View Meetinghouse in Google Maps
                </a>
              }
            </div>
            <p class="text-sm muted" style="margin: 0">
              This tool is provided by the Asheville North Carolina Stake to help members
              identify their congregation following recent boundary changes. Official Church
              records remain authoritative. If this doesn't look right, please contact your
              bishop, branch president, or the stake presidency.
            </p>
          } @else if (s.kind === 'not-found') {
            <div class="card stack" style="background: var(--bg)">
              <p style="margin: 0"><strong>We couldn't locate that address.</strong></p>
              <p class="text-sm muted" style="margin: 0">
                Double-check the street address, city, state, and ZIP code, then try again.
              </p>
            </div>
          } @else if (s.kind === 'outside-stake') {
            <div class="card stack" style="background: var(--bg)">
              <p style="margin: 0">
                <strong
                  >This address does not appear to be within the Asheville North Carolina
                  Stake.</strong
                >
              </p>
              <p class="text-sm muted" style="margin: 0">
                Try the official
                <a [href]="meetinghouseLocatorUrl" target="_blank" rel="noopener"
                  >Church Meetinghouse Locator</a
                >, or contact your local leaders.
              </p>
            </div>
          } @else if (s.kind === 'error') {
            <p class="text-sm text-danger" style="margin: 0">{{ s.message }}</p>
          }
        }
      </div>
    </div>
  `,
})
export class BoundaryLookupComponent {
  private readonly geocodingService = inject(GeocodingService);
  private readonly boundaryService = inject(BoundaryService);

  protected readonly meetinghouseLocatorUrl = MEETINGHOUSE_LOCATOR_URL;
  protected readonly supportsGeolocation =
    typeof navigator !== 'undefined' && 'geolocation' in navigator;

  protected readonly address = signal('');
  protected readonly state = signal<LookupState>({ kind: 'idle' });
  protected readonly busy = computed(() => this.state().kind === 'loading');

  protected mapsUrl(unit: UnitBoundary): string | null {
    if (!unit.meetinghouseAddress) return null;
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(unit.meetinghouseAddress)}`;
  }

  findMyUnit(): void {
    const address = this.address().trim();
    if (!address || this.busy()) return;
    this.state.set({ kind: 'loading' });
    this.geocodingService.geocode(address).subscribe({
      next: (coords) => this.lookUpCoordinates(coords),
      error: (err: unknown) => this.handleGeocodeError(err),
    });
  }

  useMyLocation(): void {
    if (this.busy() || !this.supportsGeolocation) return;
    this.state.set({ kind: 'loading' });
    navigator.geolocation.getCurrentPosition(
      (position) =>
        this.lookUpCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        }),
      () =>
        this.state.set({
          kind: 'error',
          message:
            "Couldn't get your location. Check your browser's location permission, or enter your address instead.",
        }),
      { enableHighAccuracy: false, timeout: 10_000 },
    );
  }

  private lookUpCoordinates(coordinates: Coordinates): void {
    this.boundaryService.findUnit(coordinates.latitude, coordinates.longitude).subscribe({
      next: (unit) => this.state.set(unit ? { kind: 'result', unit } : { kind: 'outside-stake' }),
      error: () =>
        this.state.set({
          kind: 'error',
          message: 'Something went wrong loading boundary data. Please try again.',
        }),
    });
  }

  private handleGeocodeError(err: unknown): void {
    if (err instanceof GeocodingError && err.kind === 'not_found') {
      this.state.set({ kind: 'not-found' });
      return;
    }
    // Logged for operability (e.g. a misconfigured/expired API key shows
    // up here) - never the address itself, only the service's own error
    // message, which describes the failure mode, not the user's input.
    console.error('[boundary] geocoding failed:', err);
    this.state.set({
      kind: 'error',
      message: "We couldn't reach the address lookup service. Please try again in a moment.",
    });
  }
}
