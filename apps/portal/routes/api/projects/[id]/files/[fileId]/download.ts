import { defineHandler } from 'void';
import { downloadFile, fileScope } from '../../../../../../src/server/project-files';

export const GET = defineHandler(async (c) => downloadFile(c, await fileScope(c, false)));
