import { documents, documentShares, documentVersions, projectFiles } from '@schema';
import type { Context } from 'hono';
import * as v from 'valibot';
import { and, db, desc, eq, isNull, lt, or, sql } from 'void/db';
import { getUser } from 'void/auth';
import { audit } from './audit';
import { bucket } from './buckets';
import { downloadFileHeaders, sharedFileKeyById } from './club-files';
import { routeParam } from './departments';
import { currentVersion, documentAccess } from './document-access';
import { sha256, validShareExpiry } from './document-rules';
import { badRequest, notFound } from './http';
import { can } from './permissions';
import { loadPersonPrincipal, loadPrincipal } from './principal';
import { projectFor } from './projects';
import { rateLimit } from './rate-limit';

export const shareInput = v.object({
  expiresAt: v.pipe(v.string(), v.isoTimestamp()),
  maxDownloads: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(100000))), null),
  requireSignIn: v.optional(v.boolean(), false),
});

export async function listShares(c: Context) {
  const access = await documentAccess(c);
  await rateLimit(c, 'document_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  const shares = await db.select({
    id: documentShares.id, expiresAt: documentShares.expiresAt, maxDownloads: documentShares.maxDownloads,
    downloads: documentShares.downloads, requireSignIn: documentShares.requireSignIn, revokedAt: documentShares.revokedAt,
    createdAt: documentShares.createdAt,
  }).from(documentShares).where(and(eq(documentShares.documentId, access.document.id),
    access.manage ? undefined : eq(documentShares.createdBy, access.principal.person.id)))
    .orderBy(desc(documentShares.createdAt)).limit(100);
  return { shares };
}

export async function createShare(c: Context, input: v.InferOutput<typeof shareInput>) {
  const access = await documentAccess(c);
  await rateLimit(c, 'document_share', 30, 3600);
  if (!validShareExpiry(input.expiresAt, Date.now())) badRequest('invalid_expiry');
  if (access.document.archived) badRequest('document_archived');
  const version = await currentVersion(access.document.id);
  if (!version) notFound('file_missing');
  const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (byte) => byte.toString(16).padStart(2, '0')).join('');
  const id = crypto.randomUUID();
  await db.insert(documentShares).values({
    id, documentId: access.document.id, versionId: version.id, tokenHash: await sha256(token),
    createdBy: access.principal.person.id, ...input,
  });
  await audit(access.principal.person.id, 'document_share.create', 'document', access.document.id, { shareId: id, ...input });
  return { id, url: `/api/document-shares/${token}`, expiresAt: input.expiresAt };
}

export async function revokeShare(c: Context) {
  const access = await documentAccess(c);
  await rateLimit(c, 'document_share', 30, 3600);
  const [share] = await db.update(documentShares).set({ revokedAt: new Date().toISOString() })
    .where(and(eq(documentShares.id, routeParam(c, 'shareId')), eq(documentShares.documentId, access.document.id),
      access.manage ? undefined : eq(documentShares.createdBy, access.principal.person.id))).returning({ id: documentShares.id });
  if (!share) notFound();
  await audit(access.principal.person.id, 'document_share.revoke', 'document', access.document.id, { shareId: share.id });
  return null;
}

/** A link cannot outlive its creator's access, nor parent metadata deletion. */
export async function publicShare(c: Context) {
  c.header('Cache-Control', 'private, no-store');
  await rateLimit(c, 'document_share_download', 60, 60);
  const token = routeParam(c, 'token');
  if (!/^[0-9a-f]{64}$/.test(token)) notFound();
  const now = new Date().toISOString();
  const eligible = and(eq(documentShares.tokenHash, await sha256(token)), isNull(documentShares.revokedAt),
    sql`${documentShares.expiresAt} > ${now}`,
    or(isNull(documentShares.maxDownloads), lt(documentShares.downloads, documentShares.maxDownloads)));
  const [row] = await db.select({ share: documentShares, document: documents, version: documentVersions })
    .from(documentShares).innerJoin(documents, eq(documents.id, documentShares.documentId))
    .innerJoin(documentVersions, eq(documentVersions.id, documentShares.versionId)).where(eligible);
  if (!row || row.document.archived) notFound();
  const creator = await loadPersonPrincipal(row.share.createdBy);
  if (!creator) notFound();
  if (row.document.projectFileId) {
    const [file] = await db.select().from(projectFiles).where(eq(projectFiles.id, row.document.projectFileId));
    if (!file) notFound();
    await projectFor(creator, file.projectId);
  } else {
    if (!can(creator.permissions, 'files.view') || !await sharedFileKeyById(bucket(c, 'CLUB_FILES'), row.document.id)) notFound();
  }
  if (row.share.requireSignIn) {
    const user = getUser();
    if (!user || !await loadPrincipal(user.id)) notFound();
  }
  const object = await bucket(c, 'CLUB_FILES').get(row.version.key);
  if (!object) notFound();
  // Conditional increment is the admission gate: concurrent requests cannot exceed the limit.
  const [claimed] = await db.update(documentShares).set({ downloads: sql`${documentShares.downloads} + 1` })
    .where(eligible).returning({ id: documentShares.id });
  if (!claimed) notFound();
  return new Response(object.body, { headers: {
    ...downloadFileHeaders(row.version.fileName, row.version.contentType),
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}
