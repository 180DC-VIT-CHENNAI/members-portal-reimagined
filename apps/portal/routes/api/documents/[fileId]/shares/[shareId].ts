import { defineHandler } from 'void';
import { revokeShare } from '../../../../../src/server/document-shares';
export const DELETE = defineHandler(revokeShare);
