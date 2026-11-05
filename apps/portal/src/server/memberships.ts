import { departmentMemberships, departments } from '@schema';
import { and, asc, db, eq, isNull, lte, or, gte } from 'void/db';

/** Memberships in force on `day` (YYYY-MM-DD) for one department, as a person-id subquery. */
export function currentMembersOf(departmentId: string, day: string) {
  return db
    .select({ id: departmentMemberships.personId })
    .from(departmentMemberships)
    .where(
      and(
        eq(departmentMemberships.departmentId, departmentId),
        lte(departmentMemberships.validFrom, day),
        or(isNull(departmentMemberships.validUntil), gte(departmentMemberships.validUntil, day)),
      ),
    );
}

export function membershipsOf(personId: string) {
  return db
    .select({
      id: departmentMemberships.id,
      departmentId: departmentMemberships.departmentId,
      departmentName: departments.name,
      note: departmentMemberships.note,
      validFrom: departmentMemberships.validFrom,
      validUntil: departmentMemberships.validUntil,
    })
    .from(departmentMemberships)
    .innerJoin(departments, eq(departments.id, departmentMemberships.departmentId))
    .where(eq(departmentMemberships.personId, personId))
    .orderBy(asc(departmentMemberships.validFrom));
}
