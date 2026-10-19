import { mailboxes, mailboxMemberships } from '@schema';
import { env } from 'cloudflare:workers';
import { and, db, eq, sql } from 'void/db';
import { forbidden, notFound } from '../http';
import type { Principal } from '../principal';
import type { MailboxCapability } from './types';

export type Mailbox = typeof mailboxes.$inferSelect;
export type MailboxAccess = { readonly mailbox: Mailbox; readonly capabilities: readonly MailboxCapability[] };

export function activeGrant(personId: string, mailboxId: string, capability?: MailboxCapability) {
  return and(
    eq(mailboxMemberships.personId, personId),
    eq(mailboxMemberships.mailboxId, mailboxId),
    sql`julianday(${mailboxMemberships.validFrom}) <= julianday('now')`,
    sql`(${mailboxMemberships.validUntil} IS NULL OR julianday(${mailboxMemberships.validUntil}) > julianday('now'))`,
    capability ? eq(mailboxMemberships.capability, capability) : undefined,
  );
}

export async function mailboxFor(actor: Principal, mailboxId: string): Promise<MailboxAccess> {
  const [mailbox] = await db.select().from(mailboxes).where(eq(mailboxes.id, mailboxId));
  if (!mailbox) notFound();
  const grants = await db.select().from(mailboxMemberships).where(activeGrant(actor.person.id, mailboxId));
  if (!grants.length) notFound();
  return { mailbox, capabilities: grants.map((g) => g.capability) };
}

export function requireCapability(access: MailboxAccess, capability: MailboxCapability): void {
  if (!access.capabilities.includes(capability)) forbidden();
}

/** The same current grant predicate is used inside write/claim statements. */
export const GRANT_SQL = `EXISTS (
  SELECT 1 FROM mailbox_memberships g JOIN people p ON p.id = g.person_id
  WHERE g.person_id = ? AND g.mailbox_id = ? AND g.capability = ?
    AND p.status IN ('active','on_leave')
    AND julianday(g.valid_from) <= julianday('now')
    AND (g.valid_until IS NULL OR julianday(g.valid_until) > julianday('now'))
)`;

export function statement(query: string, values: readonly (string | number | null)[] = []): D1PreparedStatement {
  return env.DB.prepare(query).bind(...values);
}

export function auditStatement(input: {
  readonly mailboxId: string;
  readonly actorId: string | null;
  readonly action: string;
  readonly targetId: string;
  readonly condition?: { readonly sql: string; readonly values: readonly (string | number | null)[] };
}) {
  const condition = input.condition ?? { sql: '1', values: [] };
  return statement(`INSERT INTO mail_audit (mailbox_id, actor_id, action, target_id, safe_metadata)
    SELECT ?, ?, ?, ?, '{}' WHERE ${condition.sql}`,
  [input.mailboxId, input.actorId, input.action, input.targetId, ...condition.values]);
}

export async function atomic(statements: readonly D1PreparedStatement[]) {
  return env.DB.batch([...statements]);
}
