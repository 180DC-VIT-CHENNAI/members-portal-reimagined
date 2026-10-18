import type { Context } from 'hono';
import { and, count, db, desc, eq, isNull, sql } from 'void/db';
import { people } from '../../db/schema/people';
import { projectFiles } from '../../db/schema/project-files';
import { audit } from './audit';
import { bucket } from './buckets';
import { CLUB_FILE_TYPES, clubFileProblem, downloadFileHeaders, fileExtension, MAX_CLUB_FILE_BYTES } from './club-files';
import { routeParam } from './departments';
import { requirePrincipal } from './guard';
import { badRequest, conflict, idParam, notFound } from './http';
import type { Principal } from './principal';
import { type LoadedProject, projectFor, requireRight, taskOr404 } from './projects';
import { rateLimit } from './rate-limit';

/** Outside SHARED_FILE_CATEGORIES, so the shared library never lists or serves these objects. */
export const PROJECT_FILES_PREFIX = 'project-files/';
/** Most attachments per project or task; also the list bound, so a list is always complete. */
export const MAX_FILES_PER_SCOPE = 100;
/** Multipart framing allowance above the file itself before the body is parsed. */
const FORM_OVERHEAD_BYTES = 64 * 1024;

interface FileScope {
  readonly principal: Principal;
  readonly loaded: LoadedProject;
  readonly taskId: string | null;
}

/** The caller, the project they can see (404 otherwise) and, on task routes, a task of that project. */
export async function fileScope(c: Context, onTask: boolean): Promise<FileScope> {
  const principal = await requirePrincipal(c);
  const loaded = await projectFor(principal, idParam(c));
  const taskId = onTask ? (await taskOr404(loaded.project.id, routeParam(c, 'taskId'))).id : null;
  return { principal, loaded, taskId };
}

const inScope = ({ loaded, taskId }: FileScope) =>
  and(eq(projectFiles.projectId, loaded.project.id), taskId === null ? isNull(projectFiles.taskId) : eq(projectFiles.taskId, taskId));

async function fileOr404(scope: FileScope, fileId: string) {
  if (!/^[0-9a-f]{32}$/.test(fileId)) notFound('file_not_found');
  const [file] = await db.select().from(projectFiles).where(and(eq(projectFiles.id, fileId), inScope(scope)));
  if (!file) notFound('file_not_found');
  return file;
}

export async function listFiles(c: Context, scope: FileScope) {
  await rateLimit(c, 'project_files_read', 120, 60);
  const rows = await db
    .select({
      id: projectFiles.id,
      fileName: projectFiles.fileName,
      contentType: projectFiles.contentType,
      bytes: projectFiles.bytes,
      uploadedByName: people.fullName,
      createdAt: projectFiles.createdAt,
    })
    .from(projectFiles)
    .leftJoin(people, eq(people.id, projectFiles.uploadedBy))
    .where(inScope(scope))
    .orderBy(desc(projectFiles.createdAt), desc(projectFiles.id))
    .limit(MAX_FILES_PER_SCOPE);
  c.header('Cache-Control', 'private, no-store');
  const manage = scope.loaded.access.manageTasks;
  return { files: rows, limit: MAX_FILES_PER_SCOPE, canUpload: manage && rows.length < MAX_FILES_PER_SCOPE, canDelete: manage };
}

/** Store one multipart `file` in the scope. Needs task management on the project. */
export async function uploadFile(c: Context, scope: FileScope) {
  requireRight(scope.loaded, 'manageTasks');
  await rateLimit(c, 'project_files_upload', 30, 3600);
  if (Number(c.req.header('content-length') ?? 0) > MAX_CLUB_FILE_BYTES + FORM_OVERHEAD_BYTES) {
    // Finish forwarding the body without buffering it before the HTTP adapter closes the rejected request.
    await c.req.raw.body?.pipeTo(new WritableStream());
    badRequest('file_too_large');
  }
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) badRequest('file_required');
  const problem = clubFileProblem(file);
  if (problem) badRequest(problem);
  const [{ n }] = await db.select({ n: count() }).from(projectFiles).where(inScope(scope));
  if (n >= MAX_FILES_PER_SCOPE) conflict('file_limit_reached');

  const ext = fileExtension(file.name);
  const contentType = CLUB_FILE_TYPES[ext];
  const id = crypto.randomUUID().replace(/-/g, '');
  const projectId = scope.loaded.project.id;
  const key = `${PROJECT_FILES_PREFIX}${projectId}/${id}.${ext}`;
  const fileName = file.name.slice(0, 255);
  const files = bucket(c, 'CLUB_FILES');
  await files.put(key, await file.arrayBuffer(), { httpMetadata: { contentType }, customMetadata: { fileName, projectId, taskId: scope.taskId ?? '' } });
  try {
    const inserted = await db.insert(projectFiles).select(sql`
      SELECT ${id}, ${projectId}, ${scope.taskId}, ${key}, ${fileName}, ${contentType},
        ${file.size}, ${scope.principal.person.id}, datetime('now')
      WHERE (SELECT count(*) FROM project_files WHERE project_id = ${projectId} AND task_id IS ${scope.taskId}) < ${MAX_FILES_PER_SCOPE}
    `).returning({ id: projectFiles.id });
    if (!inserted.length) conflict('file_limit_reached');
  } catch (err) {
    // No row points at the object, so remove it; the insert error is what the caller sees.
    try {
      await files.delete(key);
    } catch (cleanup) {
      throw new AggregateError([err, cleanup], 'Attachment save and cleanup failed');
    }
    throw err;
  }
  await audit(scope.principal.person.id, 'project_file.upload', 'project_file', id, { projectId, taskId: scope.taskId, fileName });
  return c.json({ id, fileName, bytes: file.size }, 201);
}

export async function downloadFile(c: Context, scope: FileScope) {
  await rateLimit(c, 'project_files_read', 120, 60);
  const file = await fileOr404(scope, routeParam(c, 'fileId'));
  const object = await bucket(c, 'CLUB_FILES').get(file.key);
  if (!object) notFound('file_missing');
  return new Response(object.body, { headers: { ...downloadFileHeaders(file.fileName, file.contentType), 'Content-Security-Policy': "default-src 'none'; sandbox" } });
}

/**
 * Remove a file. Needs task management on the project now; having uploaded it
 * grants nothing. The object goes first so a failure leaves the row to retry.
 */
export async function deleteFile(c: Context, scope: FileScope) {
  requireRight(scope.loaded, 'manageTasks');
  await rateLimit(c, 'project_files_delete', 60, 3600);
  const file = await fileOr404(scope, routeParam(c, 'fileId'));
  await bucket(c, 'CLUB_FILES').delete(file.key);
  const removed = await db.delete(projectFiles).where(eq(projectFiles.id, file.id)).returning({ id: projectFiles.id });
  if (!removed.length) notFound('file_not_found');
  await audit(scope.principal.person.id, 'project_file.delete', 'project_file', file.id, { projectId: file.projectId, taskId: file.taskId, fileName: file.fileName });
  return null;
}
