import { defineHandler } from 'void';
import { retentionInput, updateRetention } from '../../../../src/server/document-versions';
export const PATCH = defineHandler.withValidator({ body: retentionInput })(async (c, { body }) => updateRetention(c, body));
