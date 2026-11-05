import { defineHandler } from 'void';
import { articleHistory } from '../../../../src/server/knowledge';
export const GET = defineHandler(articleHistory);
