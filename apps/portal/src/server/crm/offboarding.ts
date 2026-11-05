import { auditLog, crmEngagements, crmOpportunities, crmOrganizations, crmRecordAccess } from '@schema';
import { and, db, eq, isNull, or, sql } from 'void/db';
import { registerOffboardingStep } from '../offboarding';

/**
 * CRM ownership survives a departure: owned organisations and opportunities,
 * engagement owner/lead roles and owner-role record grants move to the
 * successor, and every record grant of the leaver is removed. Each change
 * leaves an audit entry on the record. Merged records are hidden everywhere,
 * so they keep their historical owner.
 */
registerOffboardingStep({
  key: 'crm',
  label: 'CRM records handed to the successor',
  async plan({ person, successorId, actorPersonId }) {
    const [orgs, opportunities, engagements, grants] = await Promise.all([
      db.select({ id: crmOrganizations.id, name: crmOrganizations.name }).from(crmOrganizations)
        .where(and(eq(crmOrganizations.ownerId, person.id), isNull(crmOrganizations.mergedIntoId))),
      db.select({ id: crmOpportunities.id, title: crmOpportunities.title }).from(crmOpportunities).where(eq(crmOpportunities.ownerId, person.id)),
      db.select({ id: crmEngagements.id, clientOwnerId: crmEngagements.clientOwnerId, leadId: crmEngagements.leadId }).from(crmEngagements)
        .where(or(eq(crmEngagements.clientOwnerId, person.id), eq(crmEngagements.leadId, person.id))),
      db.select({ recordType: crmRecordAccess.recordType, recordId: crmRecordAccess.recordId, role: crmRecordAccess.role }).from(crmRecordAccess)
        .where(eq(crmRecordAccess.personId, person.id)),
    ]);
    const ownerGrants = grants.filter((g) => g.role === 'owner');
    const handed = orgs.length + opportunities.length + engagements.length + ownerGrants.length;
    const total = handed + grants.length - ownerGrants.length;
    const items = [
      ...orgs.map((o) => ({ id: o.id, label: `Organisation: ${o.name}` })),
      ...opportunities.map((o) => ({ id: o.id, label: `Opportunity: ${o.title}` })),
      ...engagements.map((e) => ({ id: e.id, label: 'Engagement' })),
      ...grants.map((g) => ({ id: g.recordId, label: `${g.role === 'owner' ? 'Owner' : 'Collaborator'} grant on ${g.recordType}` })),
    ];
    const needsSuccessor = handed > 0;
    if (!total || (needsSuccessor && !successorId)) return { count: total, needsSuccessor, statements: [], items };
    const entry = (action: string, targetType: string, targetId: string, details: Record<string, unknown>) =>
      db.insert(auditLog).values({ actorPersonId, action, targetType, targetId, details: { ...details, reason: 'offboarding' } });
    const to = successorId;
    return {
      count: total,
      needsSuccessor,
      items,
      statements: [
        ...(orgs.length && to
          ? [
              db.update(crmOrganizations).set({ ownerId: to, updatedAt: sql`datetime('now')` })
                .where(and(eq(crmOrganizations.ownerId, person.id), isNull(crmOrganizations.mergedIntoId))),
              ...orgs.map((o) => entry('crm.owner.reassign', 'crm_organization', o.id, { from: person.id, to })),
            ]
          : []),
        ...(opportunities.length && to
          ? [
              db.update(crmOpportunities).set({ ownerId: to, updatedAt: sql`datetime('now')` }).where(eq(crmOpportunities.ownerId, person.id)),
              ...opportunities.map((o) => entry('crm.owner.reassign', 'crm_opportunity', o.id, { from: person.id, to })),
            ]
          : []),
        ...(engagements.length && to
          ? [
              db.update(crmEngagements).set({ clientOwnerId: to, updatedAt: sql`datetime('now')` }).where(eq(crmEngagements.clientOwnerId, person.id)),
              db.update(crmEngagements).set({ leadId: to, updatedAt: sql`datetime('now')` }).where(eq(crmEngagements.leadId, person.id)),
              ...engagements.map((e) =>
                entry('crm.engagement.reassign', 'crm_engagement', e.id, {
                  from: person.id,
                  to,
                  roles: [...(e.clientOwnerId === person.id ? ['clientOwner'] : []), ...(e.leadId === person.id ? ['lead'] : [])],
                }),
              ),
            ]
          : []),
        ...(to
          ? ownerGrants.map((g) =>
              db
                .insert(crmRecordAccess)
                .values({ id: crypto.randomUUID(), recordType: g.recordType, recordId: g.recordId, personId: to, role: 'owner', createdBy: actorPersonId })
                .onConflictDoUpdate({ target: [crmRecordAccess.recordType, crmRecordAccess.recordId, crmRecordAccess.personId], set: { role: 'owner' } }),
            )
          : []),
        ...(grants.length ? [db.delete(crmRecordAccess).where(eq(crmRecordAccess.personId, person.id))] : []),
        ...grants.map((g) => entry('crm.grant.remove', `crm_${g.recordType}`, g.recordId, { personId: person.id, role: g.role, ...(g.role === 'owner' && to ? { to } : {}) })),
      ],
    };
  },
});
