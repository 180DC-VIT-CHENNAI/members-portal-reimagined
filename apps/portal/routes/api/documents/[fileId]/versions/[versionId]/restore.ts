import { defineHandler } from 'void';
import { restoreVersion } from '../../../../../../src/server/document-versions';
export const POST = defineHandler(restoreVersion);
