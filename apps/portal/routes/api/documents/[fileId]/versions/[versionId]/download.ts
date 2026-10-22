import { defineHandler } from 'void';
import { downloadVersion } from '../../../../../../src/server/document-versions';
export const GET = defineHandler(downloadVersion);
