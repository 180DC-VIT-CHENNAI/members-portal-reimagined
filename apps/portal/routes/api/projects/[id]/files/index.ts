import { defineHandler } from 'void';
import { fileScope, listFiles, uploadFile } from '../../../../../src/server/project-files';

/** Project-level attachments: anyone who can see the project lists them; task managers upload. */
export const GET = defineHandler(async (c) => listFiles(c, await fileScope(c, false)));
export const POST = defineHandler(async (c) => uploadFile(c, await fileScope(c, false)));
