import { defineHandler } from 'void';
import { publicShare } from '../../../src/server/document-shares';
export const GET = defineHandler(publicShare);
