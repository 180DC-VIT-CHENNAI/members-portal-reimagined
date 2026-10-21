import { api } from './api.ts';

export const loadSummary = () => api('/api/crm/summary');
export const loadOpportunities = (q = '') => api('/api/crm/opportunities', { query: q ? { q } : {} });
export const loadOrganizations = (q = '') => api('/api/crm/organizations', { query: q ? { q } : {} });
export const loadNextSteps = () => api('/api/crm/next-steps');
export const loadOrganization = (id: string) => api('/api/crm/organizations/:id', { params: { id } });
export const loadOpportunity = (id: string) => api('/api/crm/opportunities/:id', { params: { id } });
export const loadEngagement = (id: string) => api('/api/crm/engagements/:id', { params: { id } });

export type Summary = Awaited<ReturnType<typeof loadSummary>>;
export type Stage = Summary['stages'][number];
export type OpportunityRow = Awaited<ReturnType<typeof loadOpportunities>>[number];
export type OrganizationDetail = Awaited<ReturnType<typeof loadOrganization>>;
export type OpportunityDetail = Awaited<ReturnType<typeof loadOpportunity>>;
export type Touchpoint = OpportunityDetail['touchpoints'][number];
export type Proposal = OpportunityDetail['proposals'][number];
export type EngagementDetail = Awaited<ReturnType<typeof loadEngagement>>;
export type RecordType = 'organization' | 'opportunity' | 'contact';

export const LOST_REASONS = {
  no_response: 'No response',
  not_a_fit: 'Not a fit',
  no_capacity: 'No capacity on our side',
  chose_other: 'Chose someone else',
  budget: 'Budget',
  deferred: 'Deferred',
  other: 'Other',
} as const;

export const TOUCHPOINT_LABEL = { meeting: 'Meeting', email: 'Email', call: 'Call', note: 'Note', milestone: 'Milestone' } as const;
