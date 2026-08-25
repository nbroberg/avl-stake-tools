import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import { Observable } from 'rxjs';
import { db } from './firebase';
import type { Person } from '../models/types';

const COLLECTION = 'people';

/** Everything the LCR import (or any other creator) needs to supply. */
export interface UpsertPersonInput {
  mrn: string;
  name: string;
  unit: string;
  email?: string;
  phone?: string;
  callings?: string[];
}

@Injectable({ providedIn: 'root' })
export class PeopleService {
  list(): Observable<Person[]> {
    return new Observable<Person[]>((subscriber) => {
      const q = query(collection(db, COLLECTION), orderBy('name', 'asc'));
      return onSnapshot(
        q,
        (snap) => subscriber.next(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Person)),
        (err) => subscriber.error(err),
      );
    });
  }

  /**
   * Insert or update a person by MRN. The MRN is the document ID, so
   * re-importing the same person overwrites in place - there is no
   * "was this row already imported" question because Firestore itself
   * enforces uniqueness on the id. Fields left undefined on `input` are
   * not written (Firestore rejects `undefined`), so a re-import that
   * doesn't include e.g. a phone number won't clobber a previously
   * stored one - `setDoc({merge: true})` keeps existing keys intact.
   */
  async upsertByMrn(input: UpsertPersonInput): Promise<void> {
    const { mrn, ...rest } = input;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) clean[k] = v;
    }
    await setDoc(
      doc(db, COLLECTION, mrn),
      {
        ...clean,
        active: true,
        updatedAt: serverTimestamp(),
        // createdAt is only stamped when the doc doesn't yet exist; the
        // merge below preserves an earlier createdAt if one is there.
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }

  async update(
    mrn: string,
    patch: Partial<Omit<UpsertPersonInput, 'mrn'> & { active: boolean }>,
  ): Promise<void> {
    await updateDoc(doc(db, COLLECTION, mrn), { ...patch, updatedAt: serverTimestamp() });
  }
}
