import { Injectable } from '@angular/core';
import { from, type Observable } from 'rxjs';
import { environment } from '../../environments/environment';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

/**
 * Distinguishes "we asked Google and it plainly doesn't know that
 * address" (`not_found` - the person should fix what they typed) from
 * everything else (`api_error` - missing/invalid key, network failure,
 * a non-OK status): the boundary lookup page shows different copy for
 * each, and only the first is something the user can act on.
 */
export class GeocodingError extends Error {
  constructor(
    public readonly kind: 'not_found' | 'api_error',
    message: string,
  ) {
    super(message);
    this.name = 'GeocodingError';
  }
}

/**
 * Turns a street address into coordinates via the Google Geocoding API,
 * called directly from the browser (no Firestore, no backend - see
 * pages/boundary/boundary-lookup.component.ts, the only page that uses
 * this). The API key is baked into the client bundle same as the
 * Firebase config is - but unlike that config, it can't be locked to
 * this domain: Google's Geocoding "Web Service" REST API rejects a key
 * with an HTTP referrer restriction outright. See .env.example for
 * what's actually possible to restrict it with (API restriction + a
 * daily quota - not domain-bound). Nothing here persists the address
 * anywhere - it's forwarded to Google's endpoint and the response is
 * handed back, full stop.
 */
@Injectable({ providedIn: 'root' })
export class GeocodingService {
  geocode(address: string): Observable<Coordinates> {
    return from(this.fetchCoordinates(address));
  }

  private async fetchCoordinates(address: string): Promise<Coordinates> {
    const apiKey = environment.googleGeocodingApiKey;
    if (!apiKey) {
      throw new GeocodingError(
        'api_error',
        'Address lookup is not configured for this site yet.',
      );
    }

    const url =
      'https://maps.googleapis.com/maps/api/geocode/json' +
      `?address=${encodeURIComponent(address)}&key=${apiKey}`;

    let response: Response;
    try {
      response = await fetch(url);
    } catch {
      throw new GeocodingError('api_error', "Couldn't reach the address lookup service.");
    }

    if (!response.ok) {
      throw new GeocodingError(
        'api_error',
        `Address lookup failed (HTTP ${response.status}).`,
      );
    }

    const data = (await response.json()) as {
      status: string;
      error_message?: string;
      results: { geometry: { location: { lat: number; lng: number } } }[];
    };

    if (data.status === 'ZERO_RESULTS') {
      throw new GeocodingError('not_found', 'No match for that address.');
    }
    if (data.status !== 'OK' || !data.results.length) {
      throw new GeocodingError(
        'api_error',
        data.error_message ?? `Address lookup failed (${data.status}).`,
      );
    }

    const { lat, lng } = data.results[0].geometry.location;
    return { latitude: lat, longitude: lng };
  }
}
