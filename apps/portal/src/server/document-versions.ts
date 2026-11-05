import { documents, documentVersions, people, projectFileDeletions } from '@schema';
import type { Context } from 'hono';
import * as v from 'valibot';
import { and, db, desc, eq, sql } from 'void/db';
import { audit } from './audit';
import { bucket } from './buckets';
import { CLUB_FILE_TYPES, clubFileProblem, downloadFileHeaders, fileExtension, MAX_CLUB_FILE_BYTES } from './club-files';
import { routeParam } from './departments';
import { currentVersion, documentAccess, type DocumentAccess, requireDocumentManage } from './document-access';
import { sha256 } from './document-rules';
import { badRequest, conflict, notFound } from './http';
import { rateLimit } from './rate-limit';
import { calendarDate } from './validation';

export const retentionInput = v.object({
  retentionUntil: v.nullable(calendarDate),
  legalHold: v.boolean(),
  archived: v.optional(v.boolean(), false),
  reviewStatus: v.optional(v.picklist(['pending', 'approved', 'rejected']), 'pending'),
});

export async function versionHistory(c: Context) {
  const access = await documentAccess(c);
  await rateLimit(c, 'document_read', 120, 60);
  c.header('Cache-Control', 'private, no-store');
  const versions = await db.select({
    id: documentVersions.id, number: documentVersions.number, fileName: documentVersions.fileName,
    bytes: documentVersions.bytes, checksum: documentVersions.checksum, uploadedBy: documentVersions.uploadedBy,
    uploadedByName: people.fullName, createdAt: documentVersions.createdAt, restoredFrom: documentVersions.restoredFrom,
  }).from(documentVersions).leftJoin(people, eq(people.id, documentVersions.uploadedBy))
    .where(eq(documentVersions.documentId, access.document.id)).orderBy(desc(documentVersions.number)).limit(100);
  return { document: access.document, versions, canManage: access.manage };
}

async function selectedVersion(c: Context, access: DocumentAccess) {
  const [version] = await db.select().from(documentVersions).where(and(
    eq(documentVersions.documentId, access.document.id), eq(documentVersions.id, routeParam(c, 'versionId')),
  ));
  return version ?? notFound('version_not_found');
}

export async function downloadVersion(c: Context) {
  const access = await documentAccess(c);
  await rateLimit(c, 'document_read', 120, 60);
  const version = await selectedVersion(c, access);
  const object = await bucket(c, 'CLUB_FILES').get(version.key);
  if (!object) notFound('file_missing');
  return new Response(object.body, { headers: {
    ...downloadFileHeaders(version.fileName, version.contentType),
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}

interface VersionBytes {
  readonly bytes: ArrayBuffer;
  readonly fileName: string;
  readonly contentType: string;
  readonly restoredFrom: string | null;
}

async function appendVersion(c: Context, access: DocumentAccess, input: VersionBytes) {
  if (access.document.archived) conflict('document_archived');
  const id = crypto.randomUUID();
  const number = access.document.revision + 1;
  const key = `document-versions/${access.document.id}/${id}`;
  const checksum = await sha256(input.bytes);
  const files = bucket(c, 'CLUB_FILES');
  await files.put(key, input.bytes, { httpMetadata: { contentType: input.contentType } });
  try {
    const [changed] = await db.batch([
      db.update(documents).set({ revision: number, reviewStatus: 'pending' })
        .where(and(eq(documents.id, access.document.id), eq(documents.revision, access.document.revision))).returning({ id: documents.id }),
      db.insert(documentVersions).select(sql`
        SELECT ${id}, ${access.document.id}, ${number}, ${key}, ${input.fileName}, ${input.contentType},
          ${input.bytes.byteLength}, ${checksum}, ${access.principal.person.id}, ${input.restoredFrom}, datetime('now')
        WHERE changes() = 1
      `),
    ]);
    if (!changed.length) conflict('version_changed');
  } catch (error) {
    await db.insert(projectFileDeletions).values({ key }).onConflictDoNothing();
    throw error;
  }
  await audit(access.principal.person.id, input.restoredFrom ? 'document.restore' : 'document.version', 'document', access.document.id, { versionId: id, number, restoredFrom: input.restoredFrom });
  return c.json({ id, number, checksum }, 201);
}

export async function uploadVersion(c: Context) {
  const access = await documentAccess(c);
  requireDocumentManage(access);
  await rateLimit(c, 'document_upload', 30, 3600);
  if (Number(c.req.header('content-length') ?? 0) > MAX_CLUB_FILE_BYTES + 65536) {
    await c.req.raw.body?.pipeTo(new WritableStream());
    badRequest('file_too_large');
  }
  const file = (await c.req.formData()).get('file');
  if (!(file instanceof File)) badRequest('file_required');
  const problem = clubFileProblem(file);
  if (problem) badRequest(problem);
  return appendVersion(c, access, {
    bytes: await file.arrayBuffer(), fileName: file.name.slice(0, 255),
    contentType: CLUB_FILE_TYPES[fileExtension(file.name)], restoredFrom: null,
  });
}

export async function restoreVersion(c: Context) {
  const access = await documentAccess(c);
  requireDocumentManage(access);
  await rateLimit(c, 'document_upload', 30, 3600);
  const version = await selectedVersion(c, access);
  const object = await bucket(c, 'CLUB_FILES').get(version.key);
  if (!object) notFound('file_missing');
  return appendVersion(c, access, {
    bytes: await object.arrayBuffer(), fileName: version.fileName, contentType: version.contentType, restoredFrom: version.id,
  });
}

export async function updateRetention(c: Context, input: v.InferOutput<typeof retentionInput>) {
  const access = await documentAccess(c);
  requireDocumentManage(access);
  await rateLimit(c, 'document_manage', 60, 3600);
  await db.update(documents).set(input).where(eq(documents.id, access.document.id));
  await audit(access.principal.person.id, 'document.retention', 'document', access.document.id, input);
  return { ...access.document, ...input };
}

/** The old download URLs continue to resolve the latest immutable version. */
export async function latestDownload(c: Context, file: { readonly id: string; readonly key: string; readonly fileName: string; readonly contentType: string }) {
  const version = await currentVersion(file.id);
  const object = await bucket(c, 'CLUB_FILES').get(version?.key ?? file.key);
  if (!object) notFound('file_missing');
  return new Response(object.body, { headers: {
    ...downloadFileHeaders(version?.fileName ?? file.fileName, version?.contentType ?? file.contentType),
    'Content-Security-Policy': "default-src 'none'; sandbox",
  } });
}
