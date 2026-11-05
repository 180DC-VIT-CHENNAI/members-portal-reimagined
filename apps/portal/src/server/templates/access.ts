import { emailTemplates, emailTemplateVersions, mailboxMemberships } from '@schema';
import { and, db, eq } from 'void/db';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { activeGrant } from '../mailboxes/access';
import type { MailboxCapability } from '../mailboxes/types';
import { can, type Permission } from '../permissions';
import type { Principal } from '../principal';
import { TEMPLATE_ACTIONS, type Definition, type TemplateAction } from './validation';

export type Template = typeof emailTemplates.$inferSelect;
export type TemplateVersion = typeof emailTemplateVersions.$inferSelect;

/** Mailbox-owned templates follow the mailbox ACL; titles and global roles grant nothing there. */
const MAILBOX_CAPABILITY: Readonly<Record<TemplateAction, MailboxCapability>> = {
  author: 'mailbox.manage', edit: 'mailbox.manage', publish: 'mailbox.manage', retire: 'mailbox.manage',
  draft: 'mailbox.draft.create', review: 'mailbox.review', send: 'mailbox.send',
};

/**
 * Actions the caller may take on a template. Global templates need global
 * `templates.*` grants, department templates a grant covering that department,
 * mailbox templates the matching current mailbox capability. A non-empty
 * per-template policy list further restricts an action to the listed people.
 */
export async function actionsFor(actor: Principal, template: Pick<Template, 'ownerScope' | 'ownerId'>, definition?: Definition): Promise<readonly TemplateAction[]> {
  let granted: (action: TemplateAction) => boolean;
  if (template.ownerScope === 'mailbox') {
    if (!template.ownerId) return [];
    const grants = await db.select().from(mailboxMemberships).where(activeGrant(actor.person.id, template.ownerId));
    const capabilities = new Set(grants.map((g) => g.capability));
    granted = (action) => capabilities.has(MAILBOX_CAPABILITY[action]);
  } else {
    const scope = template.ownerScope === 'department' ? template.ownerId : null;
    granted = (action) => can(actor.permissions, `templates.${action}` as Permission, scope);
  }
  return TEMPLATE_ACTIONS.filter((action) => {
    if (!granted(action)) return false;
    const allowed = definition?.policy[action];
    return !allowed?.length || allowed.includes(actor.person.id);
  });
}

export async function templateFor(actor: Principal, id: string) {
  const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, id));
  if (!template) notFound();
  const [latest] = await db.select().from(emailTemplateVersions)
    .where(and(eq(emailTemplateVersions.templateId, id), eq(emailTemplateVersions.version, template.currentVersion)));
  if (!latest) notFound();
  const actions = await actionsFor(actor, template, latest.definition);
  if (!actions.length) notFound();
  return { template, latest, actions };
}

export async function versionFor(actor: Principal, versionId: string, action: TemplateAction) {
  const [version] = await db.select().from(emailTemplateVersions).where(eq(emailTemplateVersions.id, versionId));
  if (!version) notFound();
  const [template] = await db.select().from(emailTemplates).where(eq(emailTemplates.id, version.templateId));
  if (!template) notFound();
  const actions = await actionsFor(actor, template, version.definition);
  if (!actions.length) notFound();
  if (!actions.includes(action)) forbidden();
  return { template, version };
}

export function recipientPolicy(definition: Definition, mailboxId: string, recipients: readonly string[]) {
  if (!definition.allowedMailboxIds.includes(mailboxId)) badRequest('template_mailbox_not_allowed');
  const allowed = definition.allowedRecipients.map((x) => x.toLowerCase());
  if (allowed.length && recipients.some((x) => !allowed.includes(x.toLowerCase()))) badRequest('template_recipient_not_allowed');
}

/**
 * Re-checks a draft's pinned template version before each later step (edit,
 * submit, review, send): the caller still holds the template action, the
 * mailbox/recipients still satisfy that version, and the template is not retired.
 * Already-sent messages keep their frozen snapshot regardless.
 */
export async function checkPinned(actor: Principal, versionId: string | null, action: TemplateAction, mailboxId: string, recipients: readonly string[]) {
  if (!versionId) return;
  const { template, version } = await versionFor(actor, versionId, action);
  if (template.status === 'retired') conflict('template_retired');
  recipientPolicy(version.definition, mailboxId, recipients);
}
