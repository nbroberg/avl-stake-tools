import { Injectable } from '@angular/core';
import { Timestamp } from 'firebase/firestore';
import { BehaviorSubject, Observable } from 'rxjs';
import type { PeopleService, UpsertPersonInput } from '../people.service';
import type { Person } from '../../models/types';
import { demoPeople } from './demo-data';

/**
 * In-memory stand-in for PeopleService. Writes land in a BehaviorSubject
 * instead of Firestore, which keeps the roster import fully usable in
 * demo mode - paste, parse, import, and watch the rows appear - with
 * everything discarded on reload.
 */
@Injectable()
export class DemoPeopleService
  implements
    Pick<PeopleService, 'list' | 'listWithCalling' | 'listByUnit' | 'upsertPerson' | 'update'>
{
  private readonly people$ = new BehaviorSubject<Person[]>(demoPeople());

  list(): Observable<Person[]> {
    return this.people$.asObservable();
  }

  listWithCalling(): Observable<Person[]> {
    return new Observable<Person[]>((subscriber) => {
      const sub = this.people$.subscribe((people) => {
        subscriber.next(people.filter((p) => (p.callings ?? []).length > 0));
      });
      return () => sub.unsubscribe();
    });
  }

  listByUnit(unit: string): Observable<Person[]> {
    return new Observable<Person[]>((subscriber) => {
      const sub = this.people$.subscribe((people) => {
        subscriber.next(people.filter((p) => p.unit === unit));
      });
      return () => sub.unsubscribe();
    });
  }

  async upsertPerson(input: UpsertPersonInput): Promise<void> {
    const { id, ...rest } = input;
    // Mirror the real service: undefined fields don't clobber stored ones.
    const patch: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) patch[k] = v;
    }

    const current = this.people$.value;
    const existing = current.find((p) => p.id === id);
    const merged = {
      ...(existing ?? { id, active: true, createdAt: Timestamp.now() }),
      ...patch,
      id,
      active: true,
      updatedAt: Timestamp.now(),
    } as Person;

    const next = existing
      ? current.map((p) => (p.id === id ? merged : p))
      : [...current, merged];
    this.publish(next);
  }

  async update(
    id: string,
    patch: Partial<Omit<UpsertPersonInput, 'id'> & { active: boolean }>,
  ): Promise<void> {
    this.publish(
      this.people$.value.map((p) =>
        p.id === id ? ({ ...p, ...patch, updatedAt: Timestamp.now() } as Person) : p,
      ),
    );
  }

  /** The real query orders by name, so keep the mock ordering identical. */
  private publish(people: Person[]): void {
    this.people$.next([...people].sort((a, b) => a.name.localeCompare(b.name)));
  }
}
