import { defineHandler } from 'void';
import { articleInput, articleQuery, listArticles, saveArticle } from '../../../src/server/knowledge';
export const GET = defineHandler.withValidator({ query: articleQuery })(async (c, { query }) => listArticles(c, query));
export const POST = defineHandler.withValidator({ body: articleInput })(async (c, { body }) => c.json(await saveArticle(c, body), 201));
