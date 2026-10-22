import { departments, emailTemplates, emailTemplateVersions, mailDrafts, mailDraftSnapshots, mailUploads, positions, tenures, terms } from '@schema';
import * as v from 'valibot';
import { and, db, desc, eq, inArray, lt, sql } from 'void/db';
import { audit } from '../audit';
import { loadContact, loadOrganization } from '../crm/access';
import { enqueueEmailCampaign } from '../email/queue';
import { sender } from '../email/sender';
import { escapeHtml } from '../html';
import { badRequest, conflict, forbidden } from '../http';
import { atomic, mailboxFor, requireCapability, statement } from '../mailboxes/access';
import { createDraft } from '../mailboxes/drafts';
import type { Principal } from '../principal';
import { actionsFor, recipientPolicy, templateFor, versionFor } from './access';
import { definitionWarnings, renderTemplate } from './render';
import { starterDefinitions } from './starters';
import { createTemplateInput, renderInput, saveVersionInput, testInput, type Definition } from './validation';

const CLUB = { club_name: '180 Degrees Consulting VIT Chennai', club_website: 'https://180dc.vitcc.org' } as const;
const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

async function validateDefinition(actor: Principal, d: Definition) {
  const problems = definitionWarnings(d);
  if (problems.length) badRequest(problems.join('; '));
  for (const id of d.allowedMailboxIds) requireCapability(await mailboxFor(actor, id), 'mailbox.manage');
}

export async function createTemplate(actor: Principal, body: v.InferOutput<typeof createTemplateInput>) {
  if (body.ownerScope === 'global' ? body.ownerId !== null : !body.ownerId) badRequest('invalid_owner');
  if (body.ownerScope === 'mailbox') await mailboxFor(actor, body.ownerId ?? '');
  if (!(await actionsFor(actor, body)).includes('author')) forbidden();
  if (body.ownerScope === 'department') {
    const [department] = await db.select().from(departments).where(eq(departments.id, body.ownerId ?? ''));
    if (!department?.active) badRequest('unknown_department');
  }
  await validateDefinition(actor, body.definition);
  if (body.ownerScope === 'mailbox' && !body.definition.allowedMailboxIds.includes(body.ownerId ?? '')) badRequest('owner_mailbox_required');
  const id = crypto.randomUUID(), versionId = crypto.randomUUID();
  await atomic([
    statement('INSERT INTO email_templates(id,name,owner_scope,owner_id,created_by) VALUES(?,?,?,?,?)', [id, body.name, body.ownerScope, body.ownerId, actor.person.id]),
    statement('INSERT INTO email_template_versions(id,template_id,version,definition,created_by) VALUES(?,?,1,?,?)', [versionId, id, JSON.stringify(body.definition), actor.person.id]),
  ]);
  await audit(actor.person.id, 'template.create', 'email_template', id, { version: 1 });
  return { id, versionId, version: 1 };
}

/** Revisions are immutable rows; a stale `version` (another editor saved first) is a 409. */
export async function saveVersion(actor: Principal, id: string, body: v.InferOutput<typeof saveVersionInput>) {
  const loaded = await templateFor(actor, id);
  if (!loaded.actions.includes('edit')) forbidden();
  if (loaded.template.status === 'retired') conflict('template_retired');
  await validateDefinition(actor, body.definition);
  if (loaded.template.ownerScope === 'mailbox' && !body.definition.allowedMailboxIds.includes(loaded.template.ownerId ?? '')) badRequest('owner_mailbox_required');
  const versionId = crypto.randomUUID();
  const [changed] = await atomic([
    statement("UPDATE email_templates SET current_version=current_version+1 WHERE id=? AND current_version=? AND status<>'retired'", [id, body.version]),
    statement(`INSERT INTO email_template_versions(id,template_id,version,definition,created_by)
      SELECT ?,?,?,?,? WHERE changes()=1`, [versionId, id, body.version + 1, JSON.stringify(body.definition), actor.person.id]),
  ]);
  if (!changed.meta.changes) conflict('template_changed');
  await audit(actor.person.id, 'template.version', 'email_template', id, { version: body.version + 1 });
  return { id, versionId, version: body.version + 1 };
}

export async function transition(actor: Principal, id: string, version: number, action: 'publish' | 'retire') {
  const loaded = await templateFor(actor, id);
  if (!loaded.actions.includes(action)) forbidden();
  if (loaded.template.status === 'retired') conflict('template_retired');
  if (action === 'publish') await validateDefinition(actor, loaded.latest.definition);
  const rows = await db.update(emailTemplates).set(action === 'publish' ?
    { status: 'published', publishedVersionId: loaded.latest.id } : { status: 'retired' })
    .where(and(eq(emailTemplates.id, id), eq(emailTemplates.currentVersion, version), sql`${emailTemplates.status}<>'retired'`))
    .returning({ id: emailTemplates.id });
  if (!rows.length) conflict('template_changed');
  await audit(actor.person.id, `template.${action}`, 'email_template', id, { version });
  return { id, status: action === 'publish' ? 'published' as const : 'retired' as const };
}

/** Each row is authorized exactly like its detail page before it is counted or paginated. */
export async function listTemplates(actor: Principal, query: { readonly before?: string }) {
  const rows = await db.select({ template: emailTemplates, latest: emailTemplateVersions }).from(emailTemplates)
    .innerJoin(emailTemplateVersions, and(eq(emailTemplateVersions.templateId, emailTemplates.id), eq(emailTemplateVersions.version, emailTemplates.currentVersion)))
    .where(query.before ? lt(emailTemplates.id, query.before) : undefined).orderBy(desc(emailTemplates.id));
  const visible = [];
  for (const row of rows) {
    const actions = await actionsFor(actor, row.template, row.latest.definition);
    if (actions.length) visible.push({ template: row.template, actions: [...actions], category: row.latest.definition.category });
    if (visible.length === 51) break;
  }
  const templates = visible.slice(0, 50);
  return { templates, nextBefore: visible.length > 50 ? templates.at(-1)?.template.id ?? null : null };
}

export async function templateDetail(actor: Principal, id: string) {
  const loaded = await templateFor(actor, id);
  const versions = await db.select().from(emailTemplateVersions).where(eq(emailTemplateVersions.templateId, id)).orderBy(desc(emailTemplateVersions.version));
  return { template: loaded.template, latest: loaded.latest, actions: [...loaded.actions], versions };
}

export async function mailboxTemplates(actor: Principal, mailboxId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.draft.create');
  const rows = await db.select({ template: emailTemplates, version: emailTemplateVersions }).from(emailTemplates)
    .innerJoin(emailTemplateVersions, eq(emailTemplateVersions.id, emailTemplates.publishedVersionId))
    .where(eq(emailTemplates.status, 'published')).orderBy(emailTemplates.name);
  const usable = [];
  for (const { template, version } of rows) {
    if (!version.definition.allowedMailboxIds.includes(mailboxId)) continue;
    if (!(await actionsFor(actor, template, version.definition)).includes('draft')) continue;
    usable.push({ id: template.id, name: template.name, versionId: version.id, version: version.version, definition: version.definition });
  }
  return usable;
}

type Mode = 'preview' | 'draft' | 'test';

async function render(actor: Principal, mailboxId: string, input: v.InferOutput<typeof renderInput>, mode: Mode) {
  const { template, version } = await versionFor(actor, input.versionId, 'draft');
  const access = await mailboxFor(actor, mailboxId);
  requireCapability(access, 'mailbox.draft.create');
  if (access.mailbox.status !== 'active') conflict('mailbox_inactive');
  if (template.status === 'retired') conflict('template_retired');
  if (mode === 'draft' && (template.status !== 'published' || template.publishedVersionId !== version.id)) conflict('published_version_required');
  const d = version.definition;
  // A test only ever reaches the caller's own verified sign-in address.
  const to = mode === 'test' ? [actor.person.email] : input.to;
  recipientPolicy(d, mailboxId, mode === 'test' ? [] : to);
  if (!access.mailbox.categoryPolicy.includes(d.category)) badRequest('category_not_allowed');
  const values = { ...input.values };
  const attachmentIds: string[] = [], warnings: string[] = [];
  for (const f of d.fields) {
    const value = values[f.key];
    if (!value || typeof value !== 'string') continue;
    if (f.type === 'organization') values[f.key] = (await loadOrganization(actor, value)).org.name;
    if (f.type === 'contact') {
      const { contact, access: crm } = await loadContact(actor, value);
      if (!crm.private || contact.doNotContact || contact.consent !== 'granted') badRequest('verified_contact_required');
      values[f.key] = `${contact.fullName}${contact.email ? ` <${contact.email}>` : ''}`;
    }
    if (f.type === 'attachment') {
      const [file] = await db.select().from(mailUploads).where(and(eq(mailUploads.mailboxId, mailboxId), eq(mailUploads.id, value)));
      if (!file) { warnings.push(`Missing attachment: ${f.label}`); values[f.key] = ''; }
      else { values[f.key] = file.filename; attachmentIds.push(file.id); }
    }
  }
  const files = attachmentIds.length ? await db.select().from(mailUploads).where(inArray(mailUploads.id, attachmentIds)) : [];
  if (files.reduce((n, f) => n + f.bytes, 0) > MAX_ATTACHMENT_BYTES) warnings.push('Attachments exceed 3 MiB');
  const titles = await db.select({ title: positions.title }).from(tenures).innerJoin(positions, eq(positions.id, tenures.positionId))
    .innerJoin(terms, eq(terms.id, tenures.termId)).where(and(eq(tenures.personId, actor.person.id), eq(terms.isCurrent, true),
      eq(positions.active, true), sql`${tenures.endedOn} IS NULL`, sql`${tenures.startedOn}<=date('now')`));
  const rendered = renderTemplate(d, values, { member_name: actor.person.fullName, member_position: titles.map((t) => t.title).join(', '), ...CLUB });
  if (!to.length) warnings.push('Choose at least one recipient');
  return {
    ...rendered, warnings: [...rendered.warnings, ...warnings], attachmentIds, to, category: d.category,
    versionId: version.id, version: version.version, templateName: template.name, mailbox: access.mailbox,
  };
}

export async function preview(actor: Principal, mailboxId: string, input: v.InferOutput<typeof renderInput>) {
  const { mailbox: _mailbox, ...rendered } = await render(actor, mailboxId, input, 'preview');
  return rendered;
}

export async function templateDraft(actor: Principal, mailboxId: string, input: v.InferOutput<typeof renderInput>) {
  const rendered = await render(actor, mailboxId, input, 'draft');
  if (rendered.warnings.length) badRequest(rendered.warnings.join('; '));
  const created = await createDraft(actor, mailboxId, { to: rendered.to, cc: [], bcc: [], subject: rendered.subject, text: rendered.text,
    category: rendered.category, attachmentIds: rendered.attachmentIds }, { versionId: rendered.versionId, signature: rendered.signature });
  await audit(actor.person.id, 'template.draft', 'email_template_version', rendered.versionId, { draftId: created.id, mailboxId });
  return created;
}

/** One message to the caller only, through the capture-able system queue; mailbox and global pauses apply. */
export async function testSend(actor: Principal, mailboxId: string, input: v.InferOutput<typeof testInput>) {
  const rendered = await render(actor, mailboxId, { ...input, to: [] }, 'test');
  if (rendered.warnings.length) badRequest(rendered.warnings.join('; '));
  const paused = await statement('SELECT 1 FROM mail_outbound_switch WHERE id=1 AND paused=1').first();
  if (paused || rendered.mailbox.outboundPaused) conflict('outbound_paused');
  const signature = rendered.signature ? `<p>${escapeHtml(rendered.signature).replace(/\n/g, '<br>')}</p>` : '';
  const banner = `<p><strong>Test of “${escapeHtml(rendered.templateName)}” version ${rendered.version}.</strong> Only you received this message.</p><hr>`;
  const campaignId = await enqueueEmailCampaign({
    kind: 'template_test', fromAddress: sender('180DC template test'), subject: `[Test] ${rendered.subject}`,
    html: banner + rendered.html + signature, recipients: rendered.to, createdBy: actor.person.id, meta: { replyTo: actor.person.email },
  });
  await audit(actor.person.id, 'template.test', 'email_template_version', rendered.versionId, { campaignId, mailboxId });
  return { campaignId, queued: 1 };
}

export async function starterList(actor: Principal, mailboxId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.manage');
  return starterDefinitions(mailboxId);
}

/**
 * Follow-ups are suggestions only: drafts the caller sent from a template with
 * `followupDays` whose interval has elapsed. Nothing is drafted or sent automatically.
 */
export async function reminders(actor: Principal, mailboxId: string) {
  requireCapability(await mailboxFor(actor, mailboxId), 'mailbox.draft.create');
  const rows = await db.select({ draft: mailDrafts, snapshot: mailDraftSnapshots, version: emailTemplateVersions, template: emailTemplates }).from(mailDrafts)
    .innerJoin(mailDraftSnapshots, eq(mailDraftSnapshots.id, mailDrafts.currentSnapshotId))
    .innerJoin(emailTemplateVersions, eq(emailTemplateVersions.id, mailDraftSnapshots.templateVersionId))
    .innerJoin(emailTemplates, eq(emailTemplates.id, emailTemplateVersions.templateId))
    .where(and(eq(mailDrafts.mailboxId, mailboxId), eq(mailDrafts.createdBy, actor.person.id), eq(mailDrafts.state, 'accepted'),
      eq(emailTemplates.status, 'published'),
      sql`json_extract(${emailTemplateVersions.definition}, '$.followupDays') IS NOT NULL`,
      sql`julianday(${mailDrafts.updatedAt})+json_extract(${emailTemplateVersions.definition}, '$.followupDays')<=julianday('now')`))
    .orderBy(desc(mailDrafts.id)).limit(50);
  const suggestions = [];
  for (const row of rows) {
    if (!(await actionsFor(actor, row.template, row.version.definition)).includes('draft')) continue;
    suggestions.push({ draftId: row.draft.id, subject: row.snapshot.subject, templateId: row.template.id, sentAt: row.draft.updatedAt, to: [...row.snapshot.recipients.to] });
  }
  return suggestions;
}
