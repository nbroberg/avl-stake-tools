import { Injectable } from '@angular/core';
import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { Observable } from 'rxjs';
import { db } from './firebase';
import type { AppUser, RosterSyncStatus } from '../models/types';

const REF = doc(db, 'rosterSync', 'status');

/**
 * Flags whether the `people` roster is known to be behind LCR. The app
 * never connects to LCR directly (see the LCR client tool's README for
 * why), so this can't be auto-detected from a real sync event - it's
 * presidency-acknowledged: raised automatically whenever a workflow
 * finalizes via "recorded in LCR", cleared by the presidency once they've
 * actually re-run the sync.
 */
@Injectable({ providedIn: 'root' })
export class RosterSyncService {
  watch(): Observable<RosterSyncStatus | null> {
    return new Observable<RosterSyncStatus | null>((subscriber) => {
      return onSnapshot(
        REF,
        (snap) => subscriber.next(snap.exists() ? (snap.data() as RosterSyncStatus) : null),
        (err) => subscriber.error(err),
      );
    });
  }

  async flagRequired(actor: AppUser): Promise<void> {
    await setDoc(
      REF,
      {
        pending: true,
        lastRecordedAt: serverTimestamp(),
        lastRecordedBy: actor.firebaseUid,
      },
      { merge: true },
    );
  }

  async clear(actor: AppUser): Promise<void> {
    await setDoc(
      REF,
      {
        pending: false,
        clearedAt: serverTimestamp(),
        clearedBy: actor.firebaseUid,
        clearedByName: actor.displayName,
      },
      { merge: true },
    );
  }
}
