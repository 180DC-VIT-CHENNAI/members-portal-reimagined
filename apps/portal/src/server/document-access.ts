import { documents, documentVersions, projectFiles } from '@schema';
import type { Context } from 'hono';
import { and, db, eq } from 'void/db';
import { bucket } from './buckets';
import { sharedFileKeyById } from './club-files';
import { routeParam } from './departments';
import { sha256 } from './document-rules';
import { requirePrincipal } from './guard';
import { conflict, forbidden, notFound } from './http';
import { can } from './permissions';
import type { Principal } from './principal';
import { projectFor } from './projects';

export interface DocumentAccess {
  readonly principal: Principal;
  readonly document: typeof documents.$inferSelect;
  readonly manage: boolean;
}

/** Resolve existing identity first: arbitrary document IDs never bypass project/task ACLs. */
export async function documentAccess(c: Context): Promise<DocumentAccess> {
  const principal = await requirePrincipal(c);
  const id = routeParam(c, 'fileId');
  const [projectFile] = await db.select().from(projectFiles).where(eq(projectFiles.id, id));
  let manage: boolean;
  if (projectFile) {
    const loaded = await projectFor(principal, projectFile.projectId);
    manage = loaded.access.manageTasks;
    await initializeDocument(c, {
      id, projectFileId: id, sharedKey: null, key: projectFile.key,
      fileName: projectFile.fileName, contentType: projectFile.contentType,
      uploadedBy: projectFile.uploadedBy, createdAt: projectFile.createdAt,
    });
  } else {
    if (!can(principal.permissions, 'files.view')) notFound('file_not_found');
    const key = await sharedFileKeyById(bucket(c, 'CLUB_FILES'), id);
    if (!key) notFound('file_not_found');
    manage = can(principal.permissions, 'files.manage');
    const object = await bucket(c, 'CLUB_FILES').head(key);
    if (!object) notFound('file_not_found');
    await initializeDocument(c, {
      id, projectFileId: null, sharedKey: key, key,
      fileName: object.customMetadata?.fileName ?? 'download',
      contentType: object.httpMetadata?.contentType ?? 'application/octet-stream',
      uploadedBy: null, createdAt: object.customMetadata?.createdAt ?? object.uploaded.toISOString(),
    });
  }
  const [document] = await db.select().from(documents).where(eq(documents.id, id));
  if (!document) notFound('file_not_found');
  return { principal, document, manage };
}

interface InitialFile {
  readonly id: string;
  readonly projectFileId: string | null;
  readonly sharedKey: string | null;
  readonly key: string;
  readonly fileName: string;
  readonly contentType: string;
  readonly uploadedBy: string | null;
  readonly createdAt: string;
}

/** Existing objects are enrolled lazily; original bytes already constitute immutable version one. */
export async function initializeDocument(c: Context, file: InitialFile) {
  const [existing] = await db.select({ id: documents.id }).from(documents).where(eq(documents.id, file.id));
  if (existing) return;
  const object = await bucket(c, 'CLUB_FILES').get(file.key);
  if (!object) notFound('file_missing');
  const checksum = await sha256(await object.arrayBuffer());
  await db.batch([
    db.insert(documents).values({
      id: file.id, projectFileId: file.projectFileId, sharedKey: file.sharedKey, ownerId: file.uploadedBy,
    }).onConflictDoNothing(),
    db.insert(documentVersions).values({
      id: crypto.randomUUID(), documentId: file.id, number: 1, key: file.key, fileName: file.fileName,
      contentType: file.contentType, bytes: object.size, checksum, uploadedBy: file.uploadedBy, createdAt: file.createdAt,
    }).onConflictDoNothing(),
  ]);
}

export function requireDocumentManage(access: DocumentAccess) {
  if (!access.manage) forbidden();
}

export async function currentVersion(id: string) {
  const [version] = await db.select({ version: documentVersions }).from(documentVersions)
    .innerJoin(documents, and(eq(documents.id, documentVersions.documentId), eq(documents.revision, documentVersions.number)))
    .where(eq(documents.id, id));
  return version?.version;
}

export async function assertDeletable(id: string) {
  const [document] = await db.select().from(documents).where(eq(documents.id, id));
  if (document?.legalHold) {
    conflict('legal_hold');
  }
}

/** Parent removal must respect holds on every attachment it would cascade-delete. */
export async function assertProjectFilesDeletable(projectId: string, taskId?: string) {
  const [held] = await db.select({ id: documents.id }).from(documents)
    .innerJoin(projectFiles, eq(projectFiles.id, documents.projectFileId))
    .where(and(eq(projectFiles.projectId, projectId), eq(documents.legalHold, true),
      taskId ? eq(projectFiles.taskId, taskId) : undefined)).limit(1);
  if (held) conflict('legal_hold');
}
