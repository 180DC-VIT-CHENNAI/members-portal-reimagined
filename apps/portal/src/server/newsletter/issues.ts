import { emailQueue, newsletterAssets, newsletters, newsletterSubscribers } from '@schema';
import * as v from 'valibot';
import { and, db, desc, eq, isNull, or, sql } from 'void/db';
import type { QueueAttachment } from '@schema';
import { sender } from '../email/sender';
import { badRequest, conflict, forbidden, notFound } from '../http';
import { escapeHtml, sanitizeHtml } from '../html';
import { can } from '../permissions';
import type { Principal } from '../principal';
import { optionalText, singleLine } from '../validation';
import { newsletterFrame, UNSUBSCRIBE_MARKER } from './mail';

export const issueInput = v.object({
  title: singleLine(255), emailSubject: v.optional(singleLine(255)), description: optionalText(1000),
  content: v.pipe(v.string(), v.maxLength(50000)), format: v.picklist(['text', 'html']),
  sourceAssetId: optionalText(64), imageAssetId: optionalText(64), shared: v.optional(v.boolean(), false),
});
export const issuePatch = v.object({ ...issueInput.entries, version: v.pipe(v.number(), v.integer(), v.minValue(1)) });
export const MAX_EMAIL_ATTACHMENT_BYTES = 3 * 1024 * 1024;
export const slugOf = (issue: number) => `issue-${String(issue).padStart(2, '0')}`;
export const assetUrl = (key: string) => `/api/case-studies/images/${key}`;
export type Issue = typeof newsletters.$inferSelect;
export type Asset = typeof newsletterAssets.$inferSelect;

export function articleHtml(content: string, format: 'text' | 'html'): string {
  return format === 'html' ? sanitizeHtml(content) : content.split(/\n\s*\n/).map((part) => `<p>${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('\n');
}
export function issueRights(actor: Principal, issue: Issue) {
  const manage = can(actor.permissions, 'newsletter.manage', null);
  const owns = issue.createdBy === actor.person.id;
  const edit = manage || (can(actor.permissions, 'newsletter.edit', null) && (owns || issue.shared));
  return { edit, remove: manage || (owns && !issue.sentAt), send: edit && can(actor.permissions, 'newsletter.send', null), manage };
}
export async function issueFor(actor: Principal, id: string): Promise<Issue> {
  const [issue] = await db.select().from(newsletters).where(eq(newsletters.id, id));
  if (!issue || !issueRights(actor, issue).edit) notFound('newsletter_not_found');
  return issue;
}
export async function issueAssets(issue: Pick<Issue, 'sourceAssetId' | 'imageAssetId'>) {
  const ids = [issue.sourceAssetId, issue.imageAssetId].filter((id): id is string => Boolean(id));
  const rows = ids.length ? await db.select().from(newsletterAssets).where(or(...ids.map((id) => eq(newsletterAssets.id, id)))) : [];
  return { source: rows.find((asset) => asset.id === issue.sourceAssetId) ?? null, image: rows.find((asset) => asset.id === issue.imageAssetId) ?? null };
}
export async function requireAsset(actor: Principal, assetId: string | null | undefined, kind: 'source' | 'image', previous?: string | null): Promise<void> {
  if (!assetId) return;
  const [asset] = await db.select().from(newsletterAssets).where(eq(newsletterAssets.id, assetId));
  if (!asset) badRequest('newsletter_asset_missing');
  if (asset.createdBy !== actor.person.id && asset.id !== previous && !can(actor.permissions, 'newsletter.manage', null)) forbidden();
  if (kind === 'image' && !asset.contentType.startsWith('image/')) badRequest('unsupported_image_type');
}
export async function editorIssues(actor: Principal) {
  const manage = can(actor.permissions, 'newsletter.manage', null);
  const rows = await db.select().from(newsletters).where(manage ? undefined : or(eq(newsletters.createdBy, actor.person.id), eq(newsletters.shared, true))).orderBy(desc(newsletters.issue));
  return rows.map((issue) => ({ ...issue, slug: slugOf(issue.issue), access: issueRights(actor, issue) }));
}
export async function issueView(actor: Principal, id: string) {
  const issue = await issueFor(actor, id);
  return { ...issue, slug: slugOf(issue.issue), assets: await issueAssets(issue), access: issueRights(actor, issue) };
}
export function issueMail(origin: string, issue: Issue, assets: Awaited<ReturnType<typeof issueAssets>>) {
  const parts = [issue.description ? `<p>${escapeHtml(issue.description)}</p>` : '',
    assets.image ? `<p><img style="max-width:100%;height:auto" alt="" src="${origin}${assetUrl(assets.image.key)}"></p>` : '',
    sanitizeHtml(issue.content), `<p><a href="${origin}/newsletter/${slugOf(issue.issue)}">Read this issue online</a></p>`,
    assets.source ? `<p><a href="${origin}${assetUrl(assets.source.key)}">Download ${escapeHtml(assets.source.filename)}</a></p>` : ''];
  return newsletterFrame(issue.title, parts.join('\n'), UNSUBSCRIBE_MARKER);
}
export function sourceAttachment(source: Asset | null): QueueAttachment[] {
  return source && source.bytes <= MAX_EMAIL_ATTACHMENT_BYTES ? [{ key: source.key, filename: source.filename, contentType: source.contentType, required: true }] : [];
}

/** Claim the issue and insert its immutable campaign in one D1 transaction. */
export async function broadcastIssue(actor: Principal, origin: string, issue: Issue) {
  if (!issueRights(actor, issue).send) forbidden();
  const recipients = await db.select({ email: newsletterSubscribers.email }).from(newsletterSubscribers).where(eq(newsletterSubscribers.status, 'active'));
  if (!recipients.length) badRequest('no_active_subscribers');
  const assets = await issueAssets(issue);
  const id = crypto.randomUUID();
  const from = sender('180DC Newsletter');
  const html = issueMail(origin, issue, assets);
  const attachments = sourceAttachment(assets.source);
  const emails = recipients.map((subscriber) => subscriber.email);
  const [claimed] = await db.batch([
    db.update(newsletters).set({ broadcastId: id }).where(and(eq(newsletters.id, issue.id), eq(newsletters.version, issue.version), isNull(newsletters.sentAt), isNull(newsletters.broadcastId))).returning({ id: newsletters.id }),
    db.insert(emailQueue).select(db.select({
      id: sql<string>`${id}`.as('id'), kind: sql<string>`'newsletter'`.as('kind'), fromAddress: sql<string>`${from}`.as('from_address'),
      subject: sql<string>`${issue.emailSubject}`.as('subject'), html: sql<string>`${html}`.as('html'), attachments: sql<QueueAttachment[]>`${JSON.stringify(attachments)}`.as('attachments'),
      recipients: sql<string[]>`${JSON.stringify(emails)}`.as('recipients'), cursor: sql<number>`0`.as('cursor'), total: sql<number>`${emails.length}`.as('total'),
      sent: sql<number>`0`.as('sent'), failed: sql<number>`0`.as('failed'), attempts: sql<number>`0`.as('attempts'), status: sql<string>`'pending'`.as('status'), lastError: sql`NULL`.as('last_error'),
      meta: sql<Record<string, unknown>>`${JSON.stringify({ audience: 'subscribers', origin, newsletterId: issue.id, replyTo: actor.person.email })}`.as('meta'),
      createdBy: sql<string>`${actor.person.id}`.as('created_by'), createdAt: sql<string>`datetime('now')`.as('created_at'), updatedAt: sql<string>`datetime('now')`.as('updated_at'), finishedAt: sql`NULL`.as('finished_at'),
    }).from(newsletters).where(and(eq(newsletters.broadcastId, id), sql`changes() = 1`))),
  ]);
  if (!claimed.length) conflict('newsletter_already_sending_or_sent');
  return { campaignId: id, queued: emails.length };
}
