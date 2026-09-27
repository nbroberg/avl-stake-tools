import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { BoundaryService, type UnitBoundary } from '../../core/boundary.service';
import { GeocodingService, GeocodingError, type Coordinates } from '../../core/geocoding.service';

const MEETINGHOUSE_LOCATOR_URL = 'https://maps.churchofjesuschrist.org/';

/**
 * "Use My Current Location" is temporarily withheld: most people
 * trying this over the stake conference weekend (Sun 2026-09-27) are
 * doing so from the same building, which usually isn't their home
 * address's unit - "current location" would give a systematically
 * wrong answer for nearly everyone using it that way, worse than not
 * offering it at all. Address entry is unaffected.
 *
 * Re-enables itself automatically at the cutoff below rather than
 * needing a follow-up redeploy Monday - a static site has no
 * server-side clock to gate on, so this checks the viewer's own
 * device clock instead (safe to assume close enough to correct for
 * this purpose). Remove this constant and the `geolocationAvailable`
 * gate below (going back to `supportsGeolocation` alone) once it's no
 * longer needed.
 */
const GEOLOCATION_REENABLE_AT = Date.parse('2026-09-28T10:00:00Z'); // Monday 6:00 AM US Eastern (EDT, UTC-4)

type LookupState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  // units[0] is the geographic match (whose polygon contains the point);
  // units[1..] are stake-wide options (e.g. a foreign-language branch)
  // appended unconditionally alongside it - see BoundaryService.findUnits.
  | { kind: 'result'; units: UnitBoundary[] }
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
          @if (geolocationAvailable) {
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
                <h2 style="margin: 0.1rem 0 0">{{ s.units[0].unitName }}</h2>
              </div>
              @if (s.units[0].meetingTime || s.units[0].meetinghouseAddress) {
                <div class="text-sm">
                  @if (s.units[0].meetingTime) {
                    <p style="margin: 0">Sunday: {{ s.units[0].meetingTime }}</p>
                  }
                  @if (s.units[0].meetinghouseName || s.units[0].meetinghouseAddress) {
                    <p style="margin: 0">
                      Meetinghouse:
                      {{ s.units[0].meetinghouseName ? s.units[0].meetinghouseName + ' — ' : '' }}
                      {{ s.units[0].meetinghouseAddress }}
                    </p>
                  }
                </div>
              }
              @if (mapsUrl(s.units[0]); as url) {
                <a class="btn btn-responsive" [href]="url" target="_blank" rel="noopener">
                  View Meetinghouse in Google Maps
                </a>
              }
            </div>

            @for (alt of stakeWideOptions(s.units); track alt.unitId) {
              <div class="card stack" style="background: var(--bg)">
                <div>
                  <h3 style="margin: 0 0 0.1rem">{{ alt.unitName }}</h3>
                  <p class="text-sm muted" style="margin: 0">
                    This congregation is intended for Pohnpeian speakers living anywhere within
                    the stake boundaries.
                  </p>
                </div>
                @if (alt.meetingTime || alt.meetinghouseAddress) {
                  <div class="text-sm">
                    @if (alt.meetingTime) {
                      <p style="margin: 0">Sunday: {{ alt.meetingTime }}</p>
                    }
                    @if (alt.meetinghouseName || alt.meetinghouseAddress) {
                      <p style="margin: 0">
                        Meetinghouse:
                        {{ alt.meetinghouseName ? alt.meetinghouseName + ' — ' : '' }}
                        {{ alt.meetinghouseAddress }}
                      </p>
                    }
                  </div>
                }
                @if (mapsUrl(alt); as url) {
                  <a class="btn btn-responsive" [href]="url" target="_blank" rel="noopener">
                    View Meetinghouse in Google Maps
                  </a>
                }
              </div>
            }

            <p class="text-sm muted" style="margin: 0">
              This is a temporary tool provided by the Asheville North Carolina Stake to bridge
              the gap until the Church's official Meetinghouse Locator reflects these new ward
              boundaries. Official Church records remain authoritative. If this doesn't look
              right, please contact your bishop, branch president, or the stake presidency.
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
  protected readonly geolocationAvailable =
    this.supportsGeolocation && Date.now() >= GEOLOCATION_REENABLE_AT;

  protected readonly address = signal('');
  protected readonly state = signal<LookupState>({ kind: 'idle' });
  protected readonly busy = computed(() => this.state().kind === 'loading');

  /** Everything after the primary (geographic) match - see LookupState. */
  protected stakeWideOptions(units: UnitBoundary[]): UnitBoundary[] {
    return units.slice(1);
  }

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
    if (this.busy() || !this.geolocationAvailable) return;
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
    this.boundaryService.findUnits(coordinates.latitude, coordinates.longitude).subscribe({
      next: (units) =>
        this.state.set(units.length > 0 ? { kind: 'result', units } : { kind: 'outside-stake' }),
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
