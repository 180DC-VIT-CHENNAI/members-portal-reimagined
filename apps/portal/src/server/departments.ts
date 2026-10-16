import { departments, people, positions, tenures, terms } from '@schema';
import type { Context } from 'hono';
import { and, asc, db, eq, inArray, isNull } from 'void/db';
import { notFound } from './http';
import { ACTIVE_STATUSES } from './principal';

/** The `[id]` department of a `/api/departments/[id]/...` route, or 404. */
export async function departmentOr404(id: string): Promise<typeof departments.$inferSelect> {
  const [row] = await db.select().from(departments).where(eq(departments.id, id)).limit(1);
  return row ?? notFound('department_not_found');
}

/** A named route parameter other than `id` (always present on its route). */
export function routeParam(c: Context, name: string): string {
  return c.req.param(name) ?? notFound();
}

export interface DepartmentMember {
  id: string;
  fullName: string;
  email: string;
  status: string;
  photoKey: string | null;
  positions: Array<{ title: string; departmentId: string | null }>;
}

/**
 * People whose home department is `departmentId` and who still have access
 * (active or on leave), with the positions they hold in the current term.
 * Home department is what department-scoped permissions use, so the member
 * list and department access always agree.
 */
export async function departmentMembers(departmentId: string): Promise<DepartmentMember[]> {
  const members = await db
    .select({ id: people.id, fullName: people.fullName, email: people.email, status: people.status, photoKey: people.photoKey })
    .from(people)
    .where(and(eq(people.departmentId, departmentId), inArray(people.status, [...ACTIVE_STATUSES])))
    .orderBy(asc(people.fullName), asc(people.id));
  if (members.length === 0) return [];
  const held = await db
    .select({ personId: tenures.personId, title: positions.title, departmentId: positions.departmentId, rank: positions.rank })
    .from(tenures)
    .innerJoin(terms, and(eq(tenures.termId, terms.id), eq(terms.isCurrent, true)))
    .innerJoin(positions, eq(tenures.positionId, positions.id))
    .where(and(inArray(tenures.personId, members.map((m) => m.id)), isNull(tenures.endedOn)))
    .orderBy(asc(positions.rank), asc(positions.title));
  const byPerson = new Map<string, DepartmentMember['positions']>();
  for (const row of held) {
    const list = byPerson.get(row.personId) ?? [];
    list.push({ title: row.title, departmentId: row.departmentId });
    byPerson.set(row.personId, list);
  }
  return members.map((m) => ({ ...m, positions: byPerson.get(m.id) ?? [] }));
}
