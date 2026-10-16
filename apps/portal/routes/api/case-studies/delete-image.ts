import * as v from 'valibot';
import { defineHandler } from 'void';
import { bucket } from '../../../src/server/buckets';
import { isCaseStudyFileKey } from '../../../src/server/case-study-files';
import { requirePermission } from '../../../src/server/guard';
import { badRequest } from '../../../src/server/http';

/** Remove an uploaded image or source document. */
export const DELETE = defineHandler.withValidator({ body: v.object({ key: v.string() }) })(async (c, { body }) => {
  await requirePermission(c, 'content.publish');
  if (!isCaseStudyFileKey(body.key)) badRequest('invalid_key');
  await bucket(c, 'CASE_STUDIES').delete(body.key);
  return null;
});
