import { departments, letterDocuments } from '@schema';
import * as v from 'valibot';
import { defineHandler } from 'void';
import { db, desc, eq, inArray, sql } from 'void/db';
import { LETTER_TYPES, MAX_LETTER_STORAGE_BYTES } from '../../../src/lib/letter-kinds';
import { audit } from '../../../src/server/audit';
import { bucket } from '../../../src/server/buckets';
import { requirePrincipal } from '../../../src/server/guard';
import { badRequest, forbidden } from '../../../src/server/http';
import { documentSummary } from '../../../src/server/letters/access';
import { can } from '../../../src/server/permissions';
import { rateLimit } from '../../../src/server/rate-limit';
import { id } from '../../../src/server/validation';

const metadataSchema = v.object({ departmentId: v.nullable(id), data: v.pipe(v.record(v.pipe(v.string(), v.maxLength(80)), v.pipe(v.string(), v.maxLength(150000))), v.check((data) => Object.keys(data).length <= 150 && Object.entries(data).every(([key,value]) => key === 'mouLogo' || value.length <= 20000) && JSON.stringify(data).length <= 200000, 'letter_metadata_too_large')) });
export const GET = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  if (!can(actor.permissions, 'letters.manage')) forbidden();
  c.header('Cache-Control', 'private, no-store');
  const global = can(actor.permissions, 'letters.manage', null);
  const allowed = global ? [] : (await db.select({ id: departments.id }).from(departments)).filter((d) => can(actor.permissions, 'letters.manage', d.id)).map((d) => d.id);
  const rows = await db.select({
    id: letterDocuments.id, filename: letterDocuments.filename, bytes: letterDocuments.bytes, type: letterDocuments.type,
    docnum: letterDocuments.docnum, departmentId: letterDocuments.departmentId, createdBy: letterDocuments.createdBy, createdAt: letterDocuments.createdAt,
    name: sql<string>`COALESCE(CASE WHEN ${letterDocuments.type} = 'announcement' THEN json_extract(${letterDocuments.snapshot}, '$.announcementSender') ELSE json_extract(${letterDocuments.snapshot}, '$.name') END, '')`,
  }).from(letterDocuments).where(global ? undefined : inArray(letterDocuments.departmentId, allowed)).orderBy(desc(letterDocuments.createdAt), desc(letterDocuments.id)).limit(100);
  return rows.map((row) => documentSummary(row, row.name));
});

export const POST = defineHandler(async (c) => {
  const actor = await requirePrincipal(c);
  if (!can(actor.permissions, 'letters.manage')) forbidden();
  await rateLimit(c, 'letter_save', 60, 3600);
  const form = await c.req.formData();
  const raw = form.get('metadata');
  if (typeof raw !== 'string' || raw.length > 200000) badRequest('invalid_letter_metadata');
  let decoded: unknown;
  try { decoded = JSON.parse(raw); } catch (err) { if (!(err instanceof SyntaxError)) throw err; badRequest('invalid_letter_metadata'); }
  const parsed = v.safeParse(metadataSchema, decoded);
  if (!parsed.success) badRequest('invalid_letter_metadata');
  const { departmentId, data } = parsed.output;
  if (!can(actor.permissions, 'letters.manage', departmentId)) forbidden();
  if (departmentId && !(await db.select({ id: departments.id }).from(departments).where(eq(departments.id, departmentId))).length) badRequest('unknown_department');
  const kind = v.safeParse(v.picklist(LETTER_TYPES), data.type);
  if (!kind.success) badRequest('invalid_letter_type');
  if (!/^180DC-[A-F0-9]{8}$/.test(data.docnum ?? '') || !data.dateStr?.trim()) badRequest('invalid_letter_metadata');
  const file = form.get('file');
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith('.pdf')) badRequest('pdf_required');
  if (!file.size || file.size > MAX_LETTER_STORAGE_BYTES) badRequest('file_too_large');
  const bytes = await file.arrayBuffer();
  if (!new TextDecoder().decode(bytes.slice(0,5)).startsWith('%PDF-')) badRequest('pdf_required');
  const id = crypto.randomUUID(), key = `letters/${id}.pdf`, filename = `${data.docnum}-${kind.output}.pdf`;
  await bucket(c, 'CLUB_FILES').put(key, bytes, { httpMetadata: { contentType: 'application/pdf' } });
  try {
    await db.insert(letterDocuments).values({ id, key, filename, bytes: file.size, type: kind.output, docnum: data.docnum, departmentId, snapshot: data, createdBy: actor.person.id });
  } catch (err) { await bucket(c, 'CLUB_FILES').delete(key); throw err; }
  await audit(actor.person.id, 'letter.save', 'letter_document', id, { type: kind.output, docnum: data.docnum, bytes: file.size });
  return { id, docnum: data.docnum, filename, bytes: file.size, downloadUrl: `/api/letters/${id}/file`, emailEligible: file.size <= 3 * 1024 * 1024 };
});
