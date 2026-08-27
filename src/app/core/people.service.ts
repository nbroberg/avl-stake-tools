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
  /** Doc id - slug from Full Name + Birth Year (see lcr-parser). */
  id: string;
  name: string;
  fullName: string;
  birthYear: number;
  unit: string;
  email?: string;
  phone?: string;
  priesthoodOffice?: string;
  callings?: string[];
  sustainedAt?: Record<string, string>;
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
   * Insert or update a person by id (slug). The id is the document id,
   * so re-importing the same person overwrites in place - Firestore
   * enforces uniqueness on the id. Fields left undefined on `input` are
   * not written (Firestore rejects `undefined`), so a re-import that
   * doesn't include e.g. a phone number won't clobber a previously
   * stored one - `setDoc({merge: true})` keeps existing keys intact.
   */
  async upsertPerson(input: UpsertPersonInput): Promise<void> {
    const { id, ...rest } = input;
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) clean[k] = v;
    }
    await setDoc(
      doc(db, COLLECTION, id),
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
    id: string,
    patch: Partial<Omit<UpsertPersonInput, 'id'> & { active: boolean }>,
  ): Promise<void> {
    await updateDoc(doc(db, COLLECTION, id), { ...patch, updatedAt: serverTimestamp() });
  }
}
