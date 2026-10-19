import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../../src/server/guard';
import { idParam, notFound } from '../../../../../src/server/http';
import { download } from '../../../../../src/server/mailboxes/files';

export const GET = defineHandler(async (c) => download(c, await requirePrincipal(c), idParam(c), c.req.param('fileId') ?? notFound()));
