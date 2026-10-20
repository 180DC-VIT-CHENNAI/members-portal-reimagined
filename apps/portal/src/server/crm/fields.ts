import {
  CRM_CONFIDENTIALITY,
  CRM_CONSENT,
  CRM_GRANT_ROLES,
  CRM_LIFECYCLES,
  CRM_LOST_REASONS,
  CRM_PRIORITIES,
  CRM_SOURCES,
  CRM_TOUCHPOINT_KINDS,
} from '@schema';
import * as v from 'valibot';
import { calendarDate, emailAddress, id, optionalText, singleLine } from '../validation';

const tag = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40));

export const organizationFields = {
  name: singleLine(200),
  website: optionalText(300),
  industry: optionalText(120),
  geography: optionalText(120),
  tags: v.optional(v.pipe(v.array(tag), v.maxLength(20))),
  lifecycle: v.optional(v.picklist(CRM_LIFECYCLES)),
  source: v.optional(v.picklist(CRM_SOURCES)),
};

export const contactFields = {
  fullName: singleLine(120),
  roleTitle: optionalText(120),
  email: v.optional(v.nullable(emailAddress)),
  phone: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.regex(/^[+0-9 ()-]{6,20}$/, 'invalid_phone')))),
  consent: v.optional(v.picklist(CRM_CONSENT)),
  doNotContact: v.optional(v.boolean()),
  preferredChannel: optionalText(40),
  restrictedNotes: optionalText(4000),
};

export const opportunityFields = {
  title: singleLine(200),
  primaryContactId: v.optional(v.nullable(id)),
  source: v.optional(v.picklist(CRM_SOURCES)),
  priority: v.optional(v.picklist(CRM_PRIORITIES)),
  nextAction: optionalText(300),
  nextActionDue: v.optional(v.nullable(calendarDate)),
};

export const stageChange = v.object({
  stageId: id,
  lostReason: v.optional(v.nullable(v.picklist(CRM_LOST_REASONS))),
  lostNote: optionalText(1000),
});

export const stageFields = {
  label: singleLine(60),
  sortOrder: v.optional(v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(899))),
  active: v.optional(v.boolean()),
};

/** Email touchpoints carry a subject-sized summary and a reference only; notes are refused for them. */
export const touchpointFields = v.object({
  kind: v.picklist(CRM_TOUCHPOINT_KINDS),
  organizationId: v.optional(id),
  opportunityId: v.optional(id),
  contactId: v.optional(id),
  summary: singleLine(200),
  notes: optionalText(5000),
  externalRef: optionalText(200),
  occurredAt: v.pipe(v.string(), v.isoTimestamp()),
});

const proposalText = (max: number) => v.optional(v.pipe(v.string(), v.trim(), v.maxLength(max)), '');

export const proposalContent = {
  scope: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(8000)),
  objectives: proposalText(8000),
  timeline: proposalText(4000),
  deliverables: proposalText(8000),
};

export const acceptFields = v.object({
  departmentIds: v.pipe(v.array(id), v.minLength(1), v.maxLength(20)),
  leadId: id,
  confidentiality: v.optional(v.picklist(CRM_CONFIDENTIALITY)),
  deadline: v.optional(v.nullable(calendarDate)),
});

export const closeoutFields = {
  deliverablesAccepted: v.optional(v.boolean()),
  filesArchived: v.optional(v.boolean()),
  knowledgeTransferDone: v.optional(v.boolean()),
  clientFeedback: optionalText(4000),
  caseStudyConsent: v.optional(v.boolean()),
};

export const grantFields = v.object({ personId: id, role: v.optional(v.picklist(CRM_GRANT_ROLES)) });

export const searchQuery = v.object({ q: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(100))) });
