import { mailAudit, mailboxes, mailboxMemberships } from '@schema';
import { db, eq } from 'void/db';
import { registerOffboardingStep } from '../offboarding';

/**
 * Leaving removes every shared-mailbox capability row (current, future and
 * expired), with one mail_audit entry per mailbox. Rows are deleted rather than
 * only gated by status, so a later reinstatement does not bring inbox access
 * back. The dispatcher re-checks grants at send time, so approved sends that
 * relied on this person are blocked when they come due.
 */
registerOffboardingStep({
  key: 'mailboxes',
  label: 'Shared mailbox access removed',
  async plan({ person, actorPersonId }) {
    const rows = await db
      .select({ mailboxId: mailboxMemberships.mailboxId, address: mailboxes.address })
      .from(mailboxMemberships)
      .innerJoin(mailboxes, eq(mailboxes.id, mailboxMemberships.mailboxId))
      .where(eq(mailboxMemberships.personId, person.id));
    const byMailbox = new Map(rows.map((row) => [row.mailboxId, row.address]));
    const items = [...byMailbox].map(([id, label]) => ({ id, label }));
    if (!rows.length) return { count: 0, needsSuccessor: false, statements: [], items };
    return {
      count: rows.length,
      needsSuccessor: false,
      items,
      statements: [
        db.delete(mailboxMemberships).where(eq(mailboxMemberships.personId, person.id)),
        ...items.map(({ id }) =>
          db.insert(mailAudit).values({ mailboxId: id, actorId: actorPersonId, action: 'mailbox.offboard', targetId: person.id, metadata: {} }),
        ),
      ],
    };
  },
});
