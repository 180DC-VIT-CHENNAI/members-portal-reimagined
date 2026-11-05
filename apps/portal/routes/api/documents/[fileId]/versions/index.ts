import { defineHandler } from 'void';
import { uploadVersion, versionHistory } from '../../../../../src/server/document-versions';
export const GET = defineHandler(versionHistory);
export const POST = defineHandler(uploadVersion);
