import { letterDocuments, people } from '@schema';
import { and, db, eq, inArray } from 'void/db';
import { LETTER_LABELS } from '../../lib/letter-kinds';
import { forbidden, notFound } from '../http';
import { can } from '../permissions';
import type { Principal } from '../principal';

export type LetterDocument = typeof letterDocuments.$inferSelect;
export function canReadLetter(actor: Principal, document: Pick<LetterDocument, 'departmentId'>): boolean {
  return can(actor.permissions, 'letters.manage', document.departmentId);
}
export async function documentFor(actor: Principal, id: string): Promise<LetterDocument> {
  const [document] = await db.select().from(letterDocuments).where(eq(letterDocuments.id, id));
  if (!document || !canReadLetter(actor, document)) notFound('letter_not_found');
  return document;
}
export async function requireRecipient(actor: Principal, document: LetterDocument, email: string): Promise<void> {
  if (!can(actor.permissions, 'letters.send', document.departmentId)) forbidden();
  if (can(actor.permissions, 'letters.send', null)) return;
  const [person] = await db.select().from(people).where(and(eq(people.email, email), inArray(people.status, ['active', 'on_leave'])));
  if (!person || !can(actor.permissions, 'letters.send', person.departmentId)) forbidden('letter_recipient_outside_scope');
}
export function documentSummary(document: Omit<LetterDocument, 'key' | 'snapshot'>, name: string) {
  const { id, filename, bytes, type, docnum, departmentId, createdBy, createdAt } = document;
  return { id, filename, bytes, type, docnum, departmentId, createdBy, createdAt, name,
    label: LETTER_LABELS[type], emailEligible: bytes <= 3 * 1024 * 1024, downloadUrl: `/api/letters/${id}/file` };
}
