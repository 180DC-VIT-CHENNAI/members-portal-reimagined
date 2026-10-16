import { HTTPException } from 'hono/http-exception';

export function badRequest(message: string): never {
  throw new HTTPException(400, { message });
}

export function forbidden(message = 'forbidden'): never {
  throw new HTTPException(403, { message });
}

export function notFound(message = 'not_found'): never {
  throw new HTTPException(404, { message });
}

export function conflict(message: string): never {
  throw new HTTPException(409, { message });
}

/** The `[id]` route parameter (always present on `[id]` routes). */
export function idParam(c: { req: { param(name: 'id'): string | undefined } }): string {
  return c.req.param('id') ?? notFound();
}
