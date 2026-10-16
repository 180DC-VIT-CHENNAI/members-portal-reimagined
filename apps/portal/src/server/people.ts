import { people } from '@schema';
import { db, eq } from 'void/db';
import { notFound } from './http';
import { can } from './permissions';
import type { Person, Principal } from './principal';

export async function getPersonOr404(id: string): Promise<Person> {
  const [person] = await db.select().from(people).where(eq(people.id, id)).limit(1);
  return person ?? notFound('person_not_found');
}

/** True when the viewer may see private fields (phone, reg no) of `person`. */
export function canSeePrivate(viewer: Principal, person: Person): boolean {
  return viewer.person.id === person.id || can(viewer.permissions, 'people.view_private', person.departmentId);
}

/** The person as `viewer` may see them; private fields are nulled otherwise. */
export function personView(viewer: Principal, person: Person) {
  const { authUserId: _authUserId, ...rest } = person;
  if (canSeePrivate(viewer, person)) return rest;
  return { ...rest, phone: null, regNo: null };
}
