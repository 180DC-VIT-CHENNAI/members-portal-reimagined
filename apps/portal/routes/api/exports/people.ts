import { people, positions, tenures, terms } from '@schema';
import { defineHandler } from 'void';
import { and, asc, db, eq, isNull } from 'void/db';
import { audit } from '../../../src/server/audit';
import { toCsv } from '../../../src/server/csv';
import { requirePermission } from '../../../src/server/guard';
import { canSeePrivate } from '../../../src/server/people';
import { can } from '../../../src/server/permissions';

/**
 * Directory as CSV: everyone in the departments the caller may export
 * (all people for a global grant). Private columns follow view_private.
 */
export const GET = defineHandler(async (c) => {
  const actor = await requirePermission(c, 'people.export');
  const all = await db.select().from(people).orderBy(asc(people.fullName));
  const rows = all.filter((p) => can(actor.permissions, 'people.export', p.departmentId));
  const current = await db
    .select({ personId: tenures.personId, title: positions.title })
    .from(tenures)
    .innerJoin(positions, eq(positions.id, tenures.positionId))
    .innerJoin(terms, eq(terms.id, tenures.termId))
    .where(and(eq(terms.isCurrent, true), isNull(tenures.endedOn)));

  const csv = toCsv(
    ['email', 'full_name', 'status', 'department', 'access_role', 'positions', 'phone', 'reg_no', 'year', 'branch', 'linkedin', 'github', 'skills'],
    rows.map((p) => {
      const priv = canSeePrivate(actor, p);
      return [
        p.email,
        p.fullName,
        p.status,
        p.departmentId,
        p.accessRoleId,
        current.filter((t) => t.personId === p.id).map((t) => t.title).join('; '),
        priv ? p.phone : '',
        priv ? p.regNo : '',
        p.year,
        p.branch,
        p.linkedinUrl,
        p.githubUrl,
        p.skills.join('; '),
      ];
    }),
  );
  await audit(actor.person.id, 'people.export', 'person', null, { rows: rows.length });
  return c.body(csv, 200, {
    'content-type': 'text/csv; charset=utf-8',
    'content-disposition': `attachment; filename="180dc-people-${new Date().toISOString().slice(0, 10)}.csv"`,
    'cache-control': 'no-store',
  });
});
