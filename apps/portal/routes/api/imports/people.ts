import { accessRoles, auditLog, departments, emailQueue, people, positions, tenures, terms } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, eq } from 'void/db';
import { env } from 'void/env';
import { parseCsvRecords } from '../../../src/server/csv';
import { requirePermission } from '../../../src/server/guard';
import { badRequest, conflict } from '../../../src/server/http';
import { invitationCampaign, invitationHtml, invitationOrigin, isUniqueViolation } from '../../../src/server/invitations';
import { can } from '../../../src/server/permissions';
import { statusHistoryInsert } from '../../../src/server/status-history';
import { emailAddress, fullName } from '../../../src/server/validation';

const MAX_ROWS = 500;
const rowSchema = v.object({
  email: emailAddress,
  full_name: fullName,
  department: v.optional(v.pipe(v.string(), v.trim())),
  position: v.optional(v.pipe(v.string(), v.trim())),
  access_role: v.optional(v.pipe(v.string(), v.trim())),
});

/**
 * Bulk invite from CSV with columns email, full_name and optional department,
 * position (title or id) and access_role. Existing emails are skipped. With
 * `dryRun` nothing is written and the per-row result is returned. Otherwise the
 * new people, their tenures, one invitation campaign (one message per invited
 * person) and the audit entry are written in a single D1 batch.
 */
export const POST = defineHandler.withValidator({
  body: v.object({ csv: v.pipe(v.string(), v.maxLength(500_000)), dryRun: v.optional(v.boolean(), false) }),
})(async (c, { body }) => {
  const actor = await requirePermission(c, 'people.import');
  const records = parseCsvRecords(body.csv);
  if (records.length === 0) badRequest('empty_csv');
  if (records.length > MAX_ROWS) badRequest(`too_many_rows_max_${MAX_ROWS}`);

  const [depts, roles, allPositions, existing, [currentTerm]] = await Promise.all([
    db.select().from(departments),
    db.select().from(accessRoles),
    db.select().from(positions),
    db.select({ email: people.email }).from(people),
    db.select().from(terms).where(eq(terms.isCurrent, true)),
  ]);
  const deptIds = new Set(depts.filter((d) => d.active).map((d) => d.id));
  const roleIds = new Set(roles.map((r) => r.id));
  const taken = new Set(existing.map((e) => e.email));
  const canGrant = can(actor.permissions, 'people.grants');
  const today = new Date().toISOString().slice(0, 10);

  type Result = { row: number; email: string; result: 'invited' | 'skipped' | 'error'; reason?: string };
  const results: Result[] = [];
  const inserts = [];
  const invitedEmails: string[] = [];
  for (const [index, record] of records.entries()) {
    const row = index + 2; // header is row 1
    const parsed = v.safeParse(rowSchema, record);
    if (!parsed.success) {
      results.push({ row, email: record.email ?? '', result: 'error', reason: parsed.issues[0].message });
      continue;
    }
    const r = parsed.output;
    const departmentId = r.department ? r.department.toLowerCase() : null;
    const accessRoleId = r.access_role ? r.access_role.toLowerCase() : 'member';
    const fail = (reason: string) => results.push({ row, email: r.email, result: 'error', reason });
    if (taken.has(r.email)) {
      results.push({ row, email: r.email, result: 'skipped', reason: 'email_already_exists' });
      continue;
    }
    if (departmentId && !deptIds.has(departmentId)) { fail('unknown_department'); continue; }
    if (!roleIds.has(accessRoleId)) { fail('unknown_access_role'); continue; }
    if (accessRoleId !== 'member' && !canGrant) { fail('only_member_role_without_people_grants'); continue; }
    if (!can(actor.permissions, 'people.invite', departmentId)) { fail('forbidden_department'); continue; }
    let positionId: string | null = null;
    if (r.position) {
      const wanted = r.position.toLowerCase();
      const match = allPositions.find(
        (p) => p.active && (p.departmentId === departmentId || p.departmentId === null) && (p.id === r.position || p.title.toLowerCase() === wanted),
      );
      if (!match) { fail('unknown_position'); continue; }
      if (!currentTerm) { fail('no_current_term'); continue; }
      positionId = match.id;
    }
    taken.add(r.email);
    invitedEmails.push(r.email);
    results.push({ row, email: r.email, result: 'invited' });
    const personId = crypto.randomUUID();
    inserts.push(
      db.insert(people).values({ id: personId, email: r.email, fullName: r.full_name, departmentId, accessRoleId, invitedBy: actor.person.id }),
      statusHistoryInsert({ personId, from: null, to: 'invited', reason: 'csv_invitation', effectiveOn: today, actorPersonId: actor.person.id }),
    );
    if (positionId && currentTerm) {
      inserts.push(
        db.insert(tenures).values({ id: crypto.randomUUID(), personId, positionId, termId: currentTerm.id, startedOn: today }),
      );
    }
  }

  const invited = results.filter((r) => r.result === 'invited').length;
  let campaignId: string | null = null;
  if (!body.dryRun && inserts.length) {
    const production = import.meta.env.PROD || env.ENVIRONMENT === 'production';
    const campaign = invitationCampaign({
      recipients: invitedEmails,
      html: invitationHtml({ origin: invitationOrigin(c.req.url, production), inviterName: actor.person.fullName, fullName: null }),
      replyTo: actor.person.email,
      createdBy: actor.person.id,
      meta: { source: 'import' },
    });
    try {
      await db.batch([
        db.insert(emailQueue).values(campaign),
        ...inserts,
        db.insert(auditLog).values({
          actorPersonId: actor.person.id,
          action: 'people.import',
          targetType: 'person',
          targetId: null,
          details: { invited, rows: records.length, campaignId: campaign.id },
        }),
      ]);
    } catch (error) {
      if (isUniqueViolation(error)) conflict('email_already_exists');
      throw error;
    }
    campaignId = campaign.id;
  }
  return {
    dryRun: body.dryRun,
    campaignId,
    invited,
    skipped: results.filter((r) => r.result === 'skipped').length,
    errors: results.filter((r) => r.result === 'error').length,
    results,
  };
});
