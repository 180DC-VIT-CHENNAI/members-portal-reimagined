import { mailAudit, mailboxes, mailboxMemberships, people } from '@schema';
import * as v from 'valibot';
import { and, db, desc, eq, sql } from 'void/db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { can } from '../permissions';
import type { Principal } from '../principal';
import { atomic, auditStatement, mailboxFor, requireCapability, statement } from './access';
import { isUniqueViolation } from '../invitations';
import { policyInput, membershipInput, mailboxInput } from './validation';
import { inboxCounts } from './inbox-read';

export async function listMailboxes(actor: Principal) {
  const rows = await db.select({ mailbox: mailboxes }).from(mailboxes)
    .where(sql`EXISTS (SELECT 1 FROM ${mailboxMemberships}
      WHERE ${mailboxMemberships.mailboxId} = ${mailboxes.id}
        AND ${mailboxMemberships.personId} = ${actor.person.id}
        AND julianday(${mailboxMemberships.validFrom}) <= julianday('now')
        AND (${mailboxMemberships.validUntil} IS NULL OR julianday(${mailboxMemberships.validUntil}) > julianday('now'))
    )`).limit(100);
  const result = [];
  for (const row of rows) {
    const access = await mailboxFor(actor, row.mailbox.id);
    result.push({ ...row, unread: access.capabilities.includes('mailbox.read') ? (await inboxCounts(actor, row.mailbox.id)).unread : null });
  }
  return result;
}

export async function createMailbox(actor: Principal, input: v.InferOutput<typeof mailboxInput>) {
  if (!can(actor.permissions, 'mailboxes.admin', null)) forbidden();
  if (input.managerId === actor.person.id) forbidden('cannot_grant_self');
  const [person] = await db.select().from(people).where(eq(people.id, input.managerId));
  if (!person || !['active', 'on_leave', 'invited'].includes(person.status)) badRequest('invalid_manager');
  const id = crypto.randomUUID();
  try {
    await atomic([
      statement(`INSERT INTO mailboxes (id,address,display_name,purpose,created_by) VALUES (?,?,?,?,?)`,
        [id, input.address, input.displayName, input.purpose, actor.person.id]),
      statement(`INSERT INTO mailbox_memberships (mailbox_id,person_id,capability,valid_from,granted_by)
        VALUES (?,?,'mailbox.manage',?,?)`, [id, input.managerId, new Date().toISOString(), actor.person.id]),
      auditStatement({ mailboxId: id, actorId: actor.person.id, action: 'mailbox.create', targetId: id }),
    ]);
  } catch (error) {
    if (isUniqueViolation(error)) conflict('address_in_use');
    throw error;
  }
  return { id };
}

export async function updatePolicy(actor: Principal, mailboxId: string, input: v.InferOutput<typeof policyInput>) {
  const access = await mailboxFor(actor, mailboxId);
  requireCapability(access, 'mailbox.manage');
  // Production capture can never be enabled, even if a manager selects it.
  if (input.outboundAdapter === 'capture' && import.meta.env.PROD) badRequest('capture_is_development_only');
  const changes = { ...input, policyVersion: access.mailbox.policyVersion + 1 };
  const updated = await db.update(mailboxes).set(changes)
    .where(and(eq(mailboxes.id, mailboxId), eq(mailboxes.policyVersion, access.mailbox.policyVersion))).returning({ id: mailboxes.id });
  if (!updated.length) conflict('policy_changed');
  await db.insert(mailAudit).values({ mailboxId, actorId: actor.person.id, action: 'mailbox.policy', targetId: mailboxId, metadata: {} });
  return { id: mailboxId };
}

export async function setMembership(actor: Principal, mailboxId: string, personId: string, input: v.InferOutput<typeof membershipInput>) {
  // Platform administrators may recover management access, but never grant themselves inbox access.
  if (personId === actor.person.id) forbidden('cannot_grant_self');
  if (!can(actor.permissions, 'mailboxes.admin', null)) {
    requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.manage');
  }
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId));
  if (!mailbox) notFound();
  const [person] = await db.select().from(people).where(eq(people.id, personId));
  if (!person || !['active', 'on_leave', 'invited'].includes(person.status)) badRequest('invalid_member');
  if (input.validUntil && Date.parse(input.validUntil) <= Date.now()) badRequest('expiry_in_past');
  const capabilities = [...new Set(input.capabilities)];
  const statements = [statement('DELETE FROM mailbox_memberships WHERE mailbox_id=? AND person_id=?', [mailboxId, personId])];
  for (const capability of capabilities) {
    statements.push(statement(`INSERT INTO mailbox_memberships (mailbox_id,person_id,capability,valid_from,valid_until,granted_by)
      VALUES (?,?,?,?,?,?)`, [mailboxId, personId, capability, new Date().toISOString(), input.validUntil, actor.person.id]));
  }
  statements.push(auditStatement({ mailboxId, actorId: actor.person.id, action: 'mailbox.membership', targetId: personId }));
  await atomic(statements);
  return { personId, capabilities };
}

export async function members(actor: Principal, mailboxId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.manage');
  return db.select({ personId: mailboxMemberships.personId, name: people.fullName, capability: mailboxMemberships.capability, validUntil: mailboxMemberships.validUntil })
    .from(mailboxMemberships).innerJoin(people, eq(people.id, mailboxMemberships.personId))
    .where(eq(mailboxMemberships.mailboxId, mailboxId)).orderBy(desc(people.fullName)).limit(500);
}
