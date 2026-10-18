import { letterSends } from '@schema';
import { defineHandler } from 'void';
import { db, desc, eq } from 'void/db';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { documentFor, documentSummary } from '../../../../src/server/letters/access';

export const GET = defineHandler(async (c) => {
  const document = await documentFor(await requirePrincipal(c), idParam(c));
  c.header('Cache-Control', 'private, no-store');
  const sends = await db.select({ id: letterSends.id, recipient: letterSends.recipient, status: letterSends.status, lastError: letterSends.lastError, createdAt: letterSends.createdAt, acceptedAt: letterSends.acceptedAt }).from(letterSends).where(eq(letterSends.documentId, document.id)).orderBy(desc(letterSends.createdAt));
  return { ...documentSummary(document, document.type === 'announcement' ? document.snapshot.announcementSender || '' : document.snapshot.name || ''), snapshot: document.snapshot, sends };
});
