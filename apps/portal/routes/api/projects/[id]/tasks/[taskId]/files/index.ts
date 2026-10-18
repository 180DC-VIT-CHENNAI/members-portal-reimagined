import { defineHandler } from 'void';
import { fileScope, listFiles, uploadFile } from '../../../../../../../src/server/project-files';

/** One task's attachments: the task must belong to the project in the URL. */
export const GET = defineHandler(async (c) => listFiles(c, await fileScope(c, true)));
export const POST = defineHandler(async (c) => uploadFile(c, await fileScope(c, true)));
