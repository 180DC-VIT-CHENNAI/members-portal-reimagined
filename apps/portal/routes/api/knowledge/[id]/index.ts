import { defineHandler } from 'void';
import { articleDetail, articleInput, saveArticle } from '../../../../src/server/knowledge';
import { idParam } from '../../../../src/server/http';
export const GET = defineHandler(articleDetail);
export const PUT = defineHandler.withValidator({ body: articleInput })(async (c, { body }) => saveArticle(c, body, idParam(c)));
