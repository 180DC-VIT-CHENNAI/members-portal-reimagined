import { defineHandler } from 'void';
import { createShare, listShares, shareInput } from '../../../../../src/server/document-shares';
export const GET = defineHandler(listShares);
export const POST = defineHandler.withValidator({ body: shareInput })(async (c, { body }) => c.json(await createShare(c, body), 201));
