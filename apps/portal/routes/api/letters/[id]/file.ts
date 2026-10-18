import { defineHandler } from 'void';
import { bucket } from '../../../../src/server/buckets';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam, notFound } from '../../../../src/server/http';
import { documentFor } from '../../../../src/server/letters/access';

export const GET = defineHandler(async (c) => {
  const document = await documentFor(await requirePrincipal(c), idParam(c));
  const file = await bucket(c, 'CLUB_FILES').get(document.key);
  if (!file) notFound('letter_file_missing');
  return new Response(file.body, { headers: { 'Content-Type': 'application/pdf', 'Content-Disposition': `inline; filename="${document.filename}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' } });
});
