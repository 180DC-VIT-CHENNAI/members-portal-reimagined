import { defineHandler } from 'void';
import { requirePrincipal } from '../../../../src/server/guard';
import { idParam } from '../../../../src/server/http';
import { proposalOr404 } from '../../../../src/server/promotions';

/** One proposal, or 404 when the viewer may not see it. */
export const GET = defineHandler(async (c) => {
  const viewer = await requirePrincipal(c);
  c.header('Cache-Control', 'private, no-store');
  return (await proposalOr404(viewer, idParam(c))).view;
});
