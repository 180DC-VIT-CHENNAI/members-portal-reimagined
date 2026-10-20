import { crmTouchpoints } from '@schema';
import type * as v from 'valibot';
import { db } from 'void/db';
import { badRequest } from '../http';
import type { Principal } from '../principal';
import { loadOpportunity, loadOrganization, requireEdit } from './access';
import type { touchpointFields } from './fields';
import { contactInOrganization } from './records';

type TouchpointInput = v.InferOutput<typeof touchpointFields>;

/**
 * Log a touchpoint on an opportunity (or, without one, on an organisation).
 * The caller must be able to edit that record; a contact must belong to its
 * organisation. Email touchpoints keep only a subject and an external
 * reference, never the message body.
 */
export async function logTouchpoint(actor: Principal, body: TouchpointInput) {
  if (body.kind === 'email' && body.notes) badRequest('email_body_not_stored');
  if (body.kind === 'email' && !body.externalRef) badRequest('email_reference_required');
  let organizationId: string;
  if (body.opportunityId) {
    const loaded = await loadOpportunity(actor, body.opportunityId);
    requireEdit(loaded.access);
    organizationId = loaded.opportunity.organizationId;
    if (body.organizationId && body.organizationId !== organizationId) badRequest('organization_mismatch');
  } else if (body.organizationId) {
    const loaded = await loadOrganization(actor, body.organizationId);
    requireEdit(loaded.access);
    organizationId = loaded.org.id;
  } else {
    badRequest('record_required');
  }
  const contactId = body.contactId ? await contactInOrganization(actor, body.contactId, organizationId) : null;
  const id = crypto.randomUUID();
  await db.insert(crmTouchpoints).values({
    id,
    kind: body.kind,
    organizationId,
    opportunityId: body.opportunityId ?? null,
    contactId,
    summary: body.summary,
    notes: body.notes || null,
    externalRef: body.externalRef || null,
    occurredAt: body.occurredAt,
    createdBy: actor.person.id,
  });
  return { id, organizationId };
}
