import { defineHandler } from 'void';
import { decideRequest } from '../../../../src/server/consulting';
import { decisionBody } from '../../../../src/server/content';

export const POST = defineHandler.withValidator({ body: decisionBody })((c, { body }) => decideRequest(c, 'accepted', body));
