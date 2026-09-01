import { Injectable } from '@angular/core';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
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
  /**
   * @param limitCount Caps how many docs the query pulls, ordered by name.
   *   Omit to fetch the whole roster (needed by lookups that must find any
   *   given person, e.g. detail pages and calling/advancement pickers).
   */
  list(limitCount?: number): Observable<Person[]> {
    return new Observable<Person[]>((subscriber) => {
      const q = query(
        collection(db, COLLECTION),
        orderBy('name', 'asc'),
        ...(limitCount ? [limit(limitCount)] : []),
      );
      return onSnapshot(
        q,
        (snap) => subscriber.next(snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Person)),
        (err) => subscriber.error(err),
      );
    });
  }

  /**
   * People with at least one in-scope calling on record - the release
   * candidate pool is always a subset of these, so this is the whole
   * roster the Release form actually needs, typically a small fraction
   * of the full membership. The LCR import always writes `callings` as
   * an array, even an empty one (see lcr-parser.ts), never leaving it
   * unset, so the inequality filter reliably excludes only the people
   * who truly hold nothing.
   *
   * No `orderBy` here on purpose - Firestore requires an inequality
   * filter's field to be the first orderBy, and ordering by an array
   * value wouldn't be meaningful anyway. Callers that need name order
   * already sort client-side.
   */
  listWithCalling(): Observable<Person[]> {
    return new Observable<Person[]>((subscriber) => {
      const q = query(collection(db, COLLECTION), where('callings', '!=', []));
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
