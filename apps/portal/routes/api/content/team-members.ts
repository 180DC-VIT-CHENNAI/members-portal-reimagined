import { departments, people, positions, tenures, terms } from '@schema';
import { defineHandler } from 'void';
import { and, asc, db, eq, inArray, isNull } from 'void/db';
import { ACTIVE_STATUSES } from '../../../src/server/principal';
import { rateLimit } from '../../../src/server/rate-limit';

interface TeamMember {
  name: string;
  photo: string | null;
  linkedin: string | null;
  department: string | null;
  positions: Array<{ title: string; department: string | null }>;
  rank: number;
}

const httpsOnly = (value: string | null) => (value && /^https:\/\//.test(value) ? value : null);

/**
 * Public: everyone with access (active or on leave) who holds a position in the
 * current term. Only public fields: no email, phone, reg no or ids.
 */
export const GET = defineHandler(async (c) => {
  await rateLimit(c, 'content_team_members', 100, 60);
  const [rows, depts] = await Promise.all([
    db
      .select({
        personId: people.id,
        fullName: people.fullName,
        photoKey: people.photoKey,
        linkedinUrl: people.linkedinUrl,
        departmentId: people.departmentId,
        title: positions.title,
        positionDepartmentId: positions.departmentId,
        rank: positions.rank,
      })
      .from(tenures)
      .innerJoin(terms, and(eq(tenures.termId, terms.id), eq(terms.isCurrent, true)))
      .innerJoin(people, eq(tenures.personId, people.id))
      .innerJoin(positions, eq(tenures.positionId, positions.id))
      .where(and(inArray(people.status, [...ACTIVE_STATUSES]), isNull(tenures.endedOn)))
      .orderBy(asc(positions.rank), asc(people.fullName)),
    db.select({ id: departments.id, name: departments.name }).from(departments),
  ]);
  const deptName = new Map(depts.map((d) => [d.id, d.name]));
  const byPerson = new Map<string, TeamMember>();
  for (const row of rows) {
    let member = byPerson.get(row.personId);
    if (!member) {
      member = {
        name: row.fullName,
        photo: httpsOnly(row.photoKey),
        linkedin: httpsOnly(row.linkedinUrl),
        department: row.departmentId ? (deptName.get(row.departmentId) ?? null) : null,
        positions: [],
        rank: row.rank,
      };
      byPerson.set(row.personId, member);
    }
    member.positions.push({ title: row.title, department: row.positionDepartmentId ? (deptName.get(row.positionDepartmentId) ?? null) : null });
  }
  return [...byPerson.values()];
});
