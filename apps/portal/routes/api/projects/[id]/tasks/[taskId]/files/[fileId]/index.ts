import { defineHandler } from 'void';
import { deleteFile, fileScope } from '../../../../../../../../src/server/project-files';

export const DELETE = defineHandler(async (c) => deleteFile(c, await fileScope(c, true)));
