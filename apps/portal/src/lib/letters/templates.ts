// Letter Studio templates: the 13 legacy document types, their data model and
// their trusted HTML. Pure module (no DOM) so it runs in the browser, in node
// tests and on the server. Every interpolated value goes through escapeHTML;
// the surrounding template markup is trusted and must not be passed through the
// portal HTML sanitizer (it would strip the styles and data-URL logos).
//
// Ported from apps/frontend/src/pages/letters/letterhead.ts. Output for each
// type is the legacy markup; see README "Deliberate differences".

import * as v from 'valibot';
import { LETTER_DC_LOGO, LETTER_VIT_LOGO } from './assets.ts';

export const LETTER_TYPES = [
  'appointment',
  'promotion',
  'termination',
  'transfer',
  'resignation',
  'showcause',
  'service',
  'relieving',
  'recognition',
  'mou',
  'announcement',
  'department-report',
  'ldi',
] as const;

export type LetterType = (typeof LETTER_TYPES)[number];

export const LetterTypeSchema = v.picklist(LETTER_TYPES);

export function isLetterType(value: unknown): value is LetterType {
  return v.is(LetterTypeSchema, value);
}

export const DOC_TYPES: readonly { readonly value: LetterType; readonly label: string }[] = [
  { value: 'appointment', label: 'Appointment' },
  { value: 'promotion', label: 'Promotion' },
  { value: 'termination', label: 'Termination' },
  { value: 'transfer', label: 'Department Transfer' },
  { value: 'resignation', label: 'Resignation' },
  { value: 'showcause', label: 'Show-Cause / Warning' },
  { value: 'service', label: 'Service Certificate' },
  { value: 'relieving', label: 'Relieving Letter' },
  { value: 'recognition', label: 'Recognition Letter' },
  { value: 'mou', label: 'Memorandum of Understanding (MOU)' },
  { value: 'announcement', label: 'Announcement Letter' },
  { value: 'department-report', label: 'Department Report' },
  { value: 'ldi', label: 'LDI Form' },
];

/** Promotion "from"/"to" positions. */
export const POSITION_OPTIONS = ['Junior Consultant', 'Consultant', 'Senior Consultant', 'Lead', 'Director', 'Board Member', 'Chairperson', 'Vice Chairperson', 'Gen Sec', 'Co Sec', 'Faculty Coordinator', 'Advisory'] as const;
/** `f-position` for every member letter except promotion. */
export const MEMBER_POSITION_OPTIONS = ['Junior Consultant', 'Consultant', 'Senior Consultant', 'Lead', 'Director', 'Board Member'] as const;
export const TEAM_OPTIONS = ['Business Strategy', 'Technical', 'CRM', 'Operations', 'Marketing', 'Finance and Legal', 'HR', 'R&D', 'DevOps', 'ML'] as const;
export const TECH_TRACK_OPTIONS = ['General', 'AI/ML', 'Product', 'DevOps'] as const;
export const FFCS_OPTIONS = ['FFCS', 'Non-FFCS'] as const;
export const PERFORMANCE_OPTIONS = ['Underwhelming', 'Not Satisfactory', 'Satisfactory', 'Overwhelming', 'Excellent', 'Outstanding'] as const;
export const SATISFACTION_OPTIONS = ['Very Dissatisfied', 'Dissatisfied', 'Neutral', 'Satisfied', 'Very Satisfied'] as const;
export const SHOWCAUSE_TYPE_OPTIONS = ['Incident', 'Absence'] as const;
export const RELIEVING_RATING_OPTIONS = ['Neutral', 'Satisfactory', 'Good', 'Very Good', 'Excellent'] as const;
export const ANNOUNCEMENT_SENDER_POSITION_OPTIONS = ['Chairperson', 'Vice Chairperson', 'Gen Sec', 'Co Sec', 'Faculty Coordinator', 'Advisory', 'Director', 'Board Member', 'Lead', 'Senior Consultant', 'Consultant', 'Junior Consultant'] as const;
export const ANNOUNCEMENT_TONE_OPTIONS = [
  { value: 'sad', label: 'Sad' },
  { value: 'neutral', label: 'Neutral' },
  { value: 'happy', label: 'Happy' },
] as const;
export const ANNOUNCEMENT_KIND_OPTIONS = [
  { value: 'general', label: 'General Announcement' },
  { value: 'event', label: 'Event Announcement' },
] as const;
export const EVENT_MODE_OPTIONS = ['In-person', 'Online', 'Hybrid'] as const;
export const LDI_CATEGORY_OPTIONS = ['New Initiative', 'Process Improvement', 'Event / Programme', 'Technology / Automation', 'People / Culture', 'Finance / Cost Saving', 'Partnership / External', 'Other'] as const;
export const LDI_PRIORITY_OPTIONS = ['Low', 'Medium', 'High', 'Critical'] as const;
export const LDI_DECISION_OPTIONS = ['Review and Discuss', 'Approve for Pilot', 'Approve for Full Execution', 'Approve with Conditions', 'Defer', 'Reject'] as const;

export const REG_PATTERN = /^[0-9]{2}[BM][A-Z]{2}[1-9][0-9]{3}$/;

export const LETTER_FORM_FIELDS = [
  'f-type', 'f-date', 'f-name', 'f-reg', 'f-position', 'f-position-from', 'f-position-to', 'f-team', 'f-team-from', 'f-team-to',
  'f-ffcs', 'f-tech-track', 'f-performance', 'f-reason', 'f-resignation-reason', 'f-satisfaction', 'f-successor', 'f-resignation-feedback',
  'f-sc-type', 'f-sc-incident', 'f-sc-date', 'f-sc-time', 'f-sc-remark', 'f-service-projects', 'f-service-positions', 'f-service-outcome',
  'f-relieving-rating', 'f-relieving-comment', 'f-rec-task', 'f-rec-outcome',
  'f-mou-party', 'f-mou-address', 'f-mou-purpose', 'f-mou-scope', 'f-mou-resp-ours', 'f-mou-resp-other', 'f-mou-docs', 'f-mou-term',
  'f-mou-confidentiality', 'f-mou-termination', 'f-mou-sign-ours', 'f-mou-sign-other',
  'f-announcement-sender', 'f-announcement-sender-position', 'f-announcement-tone', 'f-announcement-kind', 'f-announcement-message',
  'f-announcement-event-date', 'f-announcement-event-time', 'f-announcement-event-venue', 'f-announcement-event-mode',
  'f-announcement-event-action', 'f-announcement-event-notes',
  'f-report-time', 'f-report-director', 'f-report-department', 'f-report-overview', 'f-report-tasks', 'f-report-updates', 'f-report-hold',
  'f-report-struggles', 'f-report-strengths', 'f-report-other', 'f-report-vision', 'f-report-responsibility', 'f-report-strength',
  'f-report-subteams', 'f-report-senior', 'f-report-promising', 'f-report-tech-aiml', 'f-report-tech-product', 'f-report-tech-devops',
  'f-ldi-submitter', 'f-ldi-position', 'f-ldi-department', 'f-ldi-category', 'f-ldi-date', 'f-ldi-priority', 'f-ldi-title', 'f-ldi-summary',
  'f-ldi-problem', 'f-ldi-why', 'f-ldi-how', 'f-ldi-expect', 'f-ldi-outcome', 'f-ldi-beneficiaries', 'f-ldi-impact', 'f-ldi-metrics',
  'f-ldi-cost', 'f-ldi-resources', 'f-ldi-allocation', 'f-ldi-dependencies', 'f-ldi-guesstimate', 'f-ldi-assumptions', 'f-ldi-evidence',
  'f-ldi-timeline', 'f-ldi-milestones', 'f-ldi-pilot', 'f-ldi-rollout', 'f-ldi-risks', 'f-ldi-tradeoffs', 'f-ldi-alternatives',
  'f-ldi-scope', 'f-ldi-owner', 'f-ldi-stakeholders', 'f-ldi-supporters', 'f-ldi-opponents', 'f-ldi-approvals', 'f-ldi-communication',
  'f-ldi-maintenance', 'f-ldi-decision', 'f-ldi-review', 'f-ldi-next', 'f-ldi-final',
] as const;

export type LetterFormField = (typeof LETTER_FORM_FIELDS)[number];

/** Studio form state keyed by legacy form id. Unknown keys are ignored. */
export type LetterForm = Readonly<Record<string, string | undefined>>;

/** Boundary schema for persisted/posted form state: only known ids, string values. */
export const LetterFormSchema = v.record(v.picklist(LETTER_FORM_FIELDS), v.pipe(v.string(), v.maxLength(20_000)));

/** Legacy first-mount defaults; `todayIso` is `YYYY-MM-DD`. */
export function defaultLetterForm(todayIso: string): LetterForm {
  return Object.freeze({
    'f-type': 'appointment',
    'f-date': todayIso,
    'f-position': 'Junior Consultant',
    'f-position-from': 'Junior Consultant',
    'f-position-to': 'Consultant',
    'f-team': 'Business Strategy',
    'f-team-from': 'Business Strategy',
    'f-team-to': 'Technical',
    'f-ffcs': 'FFCS',
    'f-performance': 'Satisfactory',
    'f-announcement-sender-position': 'Chairperson',
    'f-announcement-tone': 'neutral',
    'f-announcement-kind': 'general',
    'f-announcement-event-mode': 'In-person',
    'f-report-department': 'Business Strategy',
    'f-satisfaction': 'Neutral',
    'f-relieving-rating': 'Good',
    'f-sc-type': 'Incident',
    'f-ldi-department': 'Business Strategy',
    'f-ldi-category': 'New Initiative',
    'f-ldi-priority': 'Medium',
    'f-ldi-decision': 'Review and Discuss',
  });
}

export type LetterData = Readonly<{
  type: LetterType;
  dateStr: string;
  name: string;
  reg: string;
  position: string;
  positionFrom: string;
  positionTo: string;
  team: string;
  teamFrom: string;
  teamTo: string;
  ffcs: string;
  techTrack: string;
  performance: string;
  reason: string;
  resignationReason: string;
  satisfaction: string;
  successor: string;
  resignationFeedback: string;
  scType: string;
  scIncident: string;
  scDate: string;
  scTime: string;
  scRemark: string;
  serviceProjects: string;
  servicePositions: string;
  serviceOutcome: string;
  relievingRating: string;
  relievingComment: string;
  recTask: string;
  recOutcome: string;
  mouParty: string;
  mouAddress: string;
  mouPurpose: string;
  mouScope: string;
  mouRespOurs: string;
  mouRespOther: string;
  mouDocs: string;
  mouTerm: string;
  mouConfidentiality: string;
  mouTermination: string;
  mouSignOurs: string;
  mouSignOther: string;
  mouLogo: string;
  announcementSender: string;
  announcementSenderPosition: string;
  announcementTone: string;
  announcementKind: string;
  announcementMessage: string;
  announcementFileName: string;
  announcementFileData: string;
  announcementEventDate: string;
  announcementEventTime: string;
  announcementEventVenue: string;
  announcementEventMode: string;
  announcementEventAction: string;
  announcementEventNotes: string;
  reportTime: string;
  reportDirector: string;
  reportDepartment: string;
  reportOverview: string;
  reportTasks: string;
  reportUpdates: string;
  reportHold: string;
  reportStruggles: string;
  reportStrengths: string;
  reportOther: string;
  reportVision: string;
  reportResponsibility: string;
  reportStrength: string;
  reportSubteams: string;
  reportSenior: string;
  reportPromising: string;
  reportTechAIML: string;
  reportTechProduct: string;
  reportTechDevOps: string;
  ldiSubmitter: string;
  ldiPosition: string;
  ldiDepartment: string;
  ldiCategory: string;
  ldiDate: string;
  ldiPriority: string;
  ldiTitle: string;
  ldiSummary: string;
  ldiProblem: string;
  ldiWhy: string;
  ldiHow: string;
  ldiExpect: string;
  ldiOutcome: string;
  ldiBeneficiaries: string;
  ldiImpact: string;
  ldiMetrics: string;
  ldiCost: string;
  ldiResources: string;
  ldiAllocation: string;
  ldiDependencies: string;
  ldiGuesstimate: string;
  ldiAssumptions: string;
  ldiEvidence: string;
  ldiTimeline: string;
  ldiMilestones: string;
  ldiPilot: string;
  ldiRollout: string;
  ldiRisks: string;
  ldiTradeoffs: string;
  ldiAlternatives: string;
  ldiScope: string;
  ldiOwner: string;
  ldiStakeholders: string;
  ldiSupporters: string;
  ldiOpponents: string;
  ldiApprovals: string;
  ldiCommunication: string;
  ldiMaintenance: string;
  ldiDecision: string;
  ldiReview: string;
  ldiNext: string;
  ldiFinal: string;
  docnum: string;
}>;

export type LetterLayout =
  /** Appointment: text over fixed top/bottom artwork. One page; shrink to >=92% or refuse. */
  | { readonly kind: 'artwork'; readonly pageClass: string }
  /** Ordinary letter: one page, shrink to >=92%; flows onto more pages beyond that. */
  | { readonly kind: 'letter'; readonly pageClass: string }
  /** Measured multi-page flow. */
  | {
      readonly kind: 'flow';
      readonly pageClass: string;
      readonly minPages: number;
      readonly label: { readonly prefix: string; readonly className: string } | null;
      /** Legacy report spreads its sections: at most N blocks on page i. */
      readonly maxBlocksPerPage: readonly number[];
    };

const ORDINARY: LetterLayout = { kind: 'letter', pageClass: 'page' };

export const LETTER_LAYOUTS: Readonly<Record<LetterType, LetterLayout>> = {
  appointment: { kind: 'artwork', pageClass: 'page appointment-page' },
  promotion: ORDINARY,
  termination: ORDINARY,
  transfer: ORDINARY,
  resignation: ORDINARY,
  showcause: ORDINARY,
  service: ORDINARY,
  relieving: ORDINARY,
  recognition: ORDINARY,
  mou: { kind: 'flow', pageClass: 'page', minPages: 1, label: null, maxBlocksPerPage: [] },
  announcement: ORDINARY,
  'department-report': {
    kind: 'flow',
    pageClass: 'page department-report-page',
    minPages: 3,
    label: { prefix: 'Department Report', className: 'report-page-label' },
    maxBlocksPerPage: [5, 5],
  },
  ldi: { kind: 'flow', pageClass: 'page', minPages: 3, label: { prefix: 'LDI Form', className: 'ldi-page-label' }, maxBlocksPerPage: [] },
};

export function escapeHTML(value: unknown): string {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function reportLines(value: string): string[] {
  return String(value || '')
    .split(/\r?\n/)
    .map((x) => x.trim())
    .filter(Boolean)
    .map((x) => x.replace(/^[•*-]\s*/, ''));
}

export function reportListHTML(value: string, emptyText = 'No information provided.'): string {
  const items = reportLines(value);
  return items.length
    ? `<ul class="report-list">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ul>`
    : `<p><em>${escapeHTML(emptyText)}</em></p>`;
}

function reportPipeRows(value: string, width: number): string[][] {
  return reportLines(value).map((line) => {
    const parts = line.split('|').map((x) => x.trim());
    while (parts.length < width) parts.push('');
    return parts.slice(0, width);
  });
}

function reportSubteamTableHTML(value: string): string {
  const rows = reportPipeRows(value, 3);
  if (!rows.length) return '<p><em>No subteam members recorded.</em></p>';
  return `<table class="report-table"><thead><tr><th>Subteam</th><th>Name</th><th>Status</th></tr></thead><tbody>${rows
    .map(([subteam = '', name = '', status = '']) => `<tr><td>${escapeHTML(subteam)}</td><td>${escapeHTML(name)}</td><td class="${status.toLowerCase() === 'active' ? 'status-active' : 'status-inactive'}">${escapeHTML(status || 'Not specified')}</td></tr>`)
    .join('')}</tbody></table>`;
}

function reportSeniorTableHTML(value: string): string {
  const rows = reportPipeRows(value, 2);
  if (!rows.length) return '<p><em>No senior consultants recorded.</em></p>';
  return `<table class="report-table"><thead><tr><th>Senior Consultant</th><th>Level of Activity</th></tr></thead><tbody>${rows
    .map(([name = '', level = '']) => `<tr><td>${escapeHTML(name)}</td><td>${escapeHTML(level || 'Not specified')}</td></tr>`)
    .join('')}</tbody></table>`;
}

const ANNOUNCEMENT_TONE_COPY = {
  sad: { intro: 'It is with regret that we share the following update.', end: 'We appreciate your understanding during this time.' },
  neutral: { intro: 'This is to inform you of the following update.', end: 'Please take note of this announcement and the information provided.' },
  happy: { intro: 'We are delighted to share the following update with you.', end: 'We look forward to your participation and continued support.' },
} as const;

function announcementTone(tone: string): { readonly intro: string; readonly end: string } {
  return tone === 'sad' || tone === 'happy' ? ANNOUNCEMENT_TONE_COPY[tone] : ANNOUNCEMENT_TONE_COPY.neutral;
}

const APPOINTMENT_RESPONSIBILITIES: Readonly<Record<string, readonly string[]>> = {
  'Business Strategy': [
    'Support consulting engagements by framing client problems, structuring analyses, and preparing practical recommendations.',
    'Contribute to strategy documents, presentations, and review material aligned with project timelines and quality expectations.',
    'Coordinate with cross-functional teams to ensure recommendations are actionable and deliver measurable outcomes.',
  ],
  Technical: [
    'Develop and maintain reliable digital solutions, platforms, and automation workflows that support chapter operations and client work.',
    "Contribute to the organisation's technical infrastructure, including websites, applications, and associated systems.",
    'Collaborate with technical leads and consultants to deliver scalable, secure, and impact-oriented implementations.',
  ],
  CRM: [
    'Maintain professional relationships with external stakeholders, including NGOs, startups, and social enterprises.',
    'Support client onboarding, communication follow-ups, and continuity across active consulting engagements.',
    'Track stakeholder requirements and feedback to strengthen long-term partnership quality and outcomes.',
  ],
  Operations: [
    'Coordinate internal workflows, meetings, and event logistics to ensure smooth day-to-day execution.',
    'Maintain timely communication and operational documentation across departments and initiatives.',
    'Support process discipline and follow-through for chapter priorities, deliverables, and governance requirements.',
  ],
  Marketing: [
    "Create and execute communication initiatives that strengthen the chapter's brand presence on campus and online.",
    'Develop content assets and campaign support material for outreach, recruitment, and project visibility.',
    'Coordinate with other departments to communicate impact stories with consistency and clarity.',
  ],
  'Finance and Legal': [
    'Support budget tracking, documentation, and responsible allocation of chapter resources.',
    'Maintain basic financial records and assist with compliance-oriented documentation and approvals.',
    'Contribute to sustainable funding and sponsorship workflows in alignment with organisational policies.',
  ],
  HR: [
    'Support recruitment, onboarding, and engagement initiatives for members across departments.',
    'Maintain member records, communication discipline, and process clarity for people-related activities.',
    'Contribute to a professional and inclusive work culture through structured team support practices.',
  ],
  'R&D': [
    'Identify and evaluate new ideas, frameworks, and best practices relevant to consulting and chapter growth.',
    'Document experiments, findings, and recommendations for practical adoption by relevant teams.',
    'Collaborate across departments to convert research outcomes into implementable initiatives.',
  ],
  DevOps: [
    'Maintain deployment workflows, environments, and operational reliability for chapter-managed technical systems.',
    'Support monitoring, release coordination, and incident-response practices with technical stakeholders.',
    'Improve automation and process efficiency for build, deployment, and infrastructure management tasks.',
  ],
  ML: [
    'Support data-driven and machine learning initiatives that align with consulting and operational priorities.',
    'Assist in model experimentation, validation, and reporting of outcomes with clear documentation.',
    'Collaborate with technical and strategy teams to translate analytical insights into practical actions.',
  ],
};

const DEFAULT_RESPONSIBILITIES = [
  'Execute assigned responsibilities in accordance with organisational standards, timelines, and reporting expectations.',
  'Collaborate professionally with relevant department members and leadership to support chapter objectives.',
  'Maintain confidentiality, accountability, and communication discipline in all assigned work.',
] as const;

function appointmentResponsibilitiesHTML(team: string): string {
  const items = APPOINTMENT_RESPONSIBILITIES[team] ?? DEFAULT_RESPONSIBILITIES;
  return `<ol class="appt-resp">${items.map((item) => `<li>${escapeHTML(item)}</li>`).join('')}</ol>`;
}

const h = escapeHTML;

function appointmentHTML(d: LetterData): string {
  return `
    <div class="appt-body">
      <div class="appt-date">${h(d.dateStr)}</div>
      <div class="appt-subject">Subject: Appointment as ${h(d.position)} &ndash; ${h(d.team)}</div>
      <div class="body">
        <p>Dear ${h(d.name)},</p>
        <p>We are pleased to appoint you as <strong>${h(d.position)}</strong> in the <strong>${h(d.team)}</strong> department of 180 Degrees Consulting, VIT Chennai Chapter, for the 2026&ndash;27 tenure, effective <strong>${h(d.dateStr)}</strong>.</p>
        <p class="appt-heading">Role Responsibilities</p>
        <p>In this role, you will be expected to:</p>
        ${appointmentResponsibilitiesHTML(d.team)}
        <p class="appt-heading">Professional Conduct</p>
        <p>You are expected to uphold the organisation&rsquo;s values, maintain confidentiality where required, and comply with all applicable directions issued by the Board and departmental leadership.</p>
        <p>We welcome you to the team and look forward to your contribution to the chapter&rsquo;s impact and growth.</p>
      </div>
      <div class="appt-close">
        <p><em>This letter is issued and authenticated by the undersigned on behalf of the Organisation.</em></p>
        <p>Warm regards,</p>
      </div>
    </div>`;
}

type WrappedType = Exclude<LetterType, 'appointment'>;

const TITLES: Readonly<Record<WrappedType, string>> = {
  promotion: 'LETTER OF PROMOTION',
  termination: 'LETTER OF TERMINATION',
  transfer: 'LETTER OF DEPARTMENT TRANSFER',
  resignation: 'LETTER OF RESIGNATION',
  showcause: 'SHOW-CAUSE / WARNING LETTER',
  service: 'SERVICE CERTIFICATE',
  relieving: 'RELIEVING LETTER',
  recognition: 'RECOGNITION LETTER',
  mou: 'MEMORANDUM OF UNDERSTANDING',
  announcement: 'ANNOUNCEMENT LETTER',
  'department-report': 'DEPARTMENT REPORT',
  ldi: 'LDI FORM',
};

function particularsHTML(d: LetterData): string {
  return `
        <tr><td class="k">Name</td><td class="sep">:</td><td>${h(d.name)}</td></tr>
        <tr><td class="k">Registration Number</td><td class="sep">:</td><td>${h(d.reg)}</td></tr>
        <tr><td class="k">Department</td><td class="sep">:</td><td>${h(d.type === 'transfer' ? d.teamFrom : d.team)}</td></tr>
        ${d.team === 'Technical' && d.techTrack && d.techTrack !== 'General' ? `<tr><td class="k">Technical Track</td><td class="sep">:</td><td>${h(d.techTrack)}</td></tr>` : ''}
        <tr><td class="k">Position</td><td class="sep">:</td><td>${h(d.type === 'promotion' ? d.positionTo : d.position)}</td></tr>`;
}

const ORG_INTRO = 'issued by 180 Degrees Consulting, VIT Chennai Chapter (the &ldquo;<strong>Organisation</strong>&rdquo;)';

function ldiBody(d: LetterData): string {
  const L = reportListHTML;
  return `
      <div class="ldi-card"><div class="ldi-meta-grid">
        <div><div class="ldi-label">Idea Title</div><strong>${h(d.ldiTitle || '(untitled idea)')}</strong></div>
        <div><div class="ldi-label">Submitted By</div><strong>${h(d.ldiSubmitter || '(not specified)')}</strong></div>
        <div><div class="ldi-label">Department</div><strong>${h(d.ldiDepartment)}</strong></div>
        <div><div class="ldi-label">Position / Role</div><strong>${h(d.ldiPosition || '(not specified)')}</strong></div>
        <div><div class="ldi-label">Category</div><strong>${h(d.ldiCategory)}</strong></div>
        <div><div class="ldi-label">Priority</div><strong>${h(d.ldiPriority)}</strong></div>
        <div><div class="ldi-label">Submission Date</div><strong>${h(d.ldiDate || d.dateStr)}</strong></div>
        <div><div class="ldi-label">Reference</div><strong>${h(d.docnum)}</strong></div>
      </div></div>
      <section class="ldi-section"><h3 class="ldi-section-title">Idea Overview</h3><p><strong>What is being proposed?</strong></p>${L(d.ldiSummary)}<p><strong>Problem / Opportunity</strong></p>${L(d.ldiProblem)}<p><strong>Why this, why now?</strong></p>${L(d.ldiWhy)}<p><strong>How will it work?</strong></p>${L(d.ldiHow)}</section>
      <section class="ldi-section"><h3 class="ldi-section-title">Expected Value and Impact</h3><p><strong>What to Expect</strong></p>${L(d.ldiExpect)}<p><strong>Expected Outcome</strong></p>${L(d.ldiOutcome)}<p><strong>Who Benefits?</strong></p>${L(d.ldiBeneficiaries)}<p><strong>Expected Impact</strong></p>${L(d.ldiImpact)}<p><strong>Success Metrics / KPIs</strong></p>${L(d.ldiMetrics)}</section>
      <section class="ldi-section"><h3 class="ldi-section-title">Cost, Resources and Allocation</h3><p><strong>Estimated Cost</strong></p>${L(d.ldiCost)}<p><strong>Resources Needed</strong></p>${L(d.ldiResources)}<p><strong>Resource Allocation</strong></p>${L(d.ldiAllocation)}<p><strong>Dependencies</strong></p>${L(d.ldiDependencies)}</section>
      <section class="ldi-section"><h3 class="ldi-section-title">Guesstimates and Assumptions</h3><p><strong>Guesstimate / Back-of-the-Envelope Calculation</strong></p>${L(d.ldiGuesstimate)}<p><strong>Key Assumptions</strong></p>${L(d.ldiAssumptions)}<p><strong>Evidence / Data</strong></p>${L(d.ldiEvidence)}</section>
      <section class="ldi-section"><h3 class="ldi-section-title">Execution Plan</h3><p><strong>Timeline</strong></p>${L(d.ldiTimeline)}<p><strong>Milestones and Owners</strong></p>${L(d.ldiMilestones)}<p><strong>Pilot / Experiment Plan</strong></p>${L(d.ldiPilot)}<p><strong>Rollout Plan</strong></p>${L(d.ldiRollout)}</section>
      <section class="ldi-section"><h3 class="ldi-section-title">Risks, Trade-offs and Alternatives</h3><p><strong>Risks</strong></p>${L(d.ldiRisks)}<p><strong>Trade-offs</strong></p>${L(d.ldiTradeoffs)}<p><strong>Alternatives Considered</strong></p>${L(d.ldiAlternatives)}<p><strong>Scope and Non-Scope</strong></p>${L(d.ldiScope)}</section>
      <section class="ldi-section"><h3 class="ldi-section-title">People, Ownership and Governance</h3><p><strong>Proposed Owner</strong></p>${L(d.ldiOwner)}<p><strong>Stakeholders</strong></p>${L(d.ldiStakeholders)}<p><strong>People Backing the Idea</strong></p>${L(d.ldiSupporters)}<p><strong>People Opposing the Idea</strong></p>${L(d.ldiOpponents)}<p><strong>Approvals Needed</strong></p>${L(d.ldiApprovals)}<p><strong>Communication Plan</strong></p>${L(d.ldiCommunication)}<p><strong>Post-Launch Ownership / Maintenance</strong></p>${L(d.ldiMaintenance)}</section>
      <section class="ldi-section"><h3 class="ldi-section-title">Decision and Review</h3><p><strong>Decision Requested:</strong> ${h(d.ldiDecision)}</p><p><strong>Review / Approval Notes</strong></p>${L(d.ldiReview)}<p><strong>Next Steps</strong></p>${L(d.ldiNext)}<p><strong>Final Recommendation / Closing Note</strong></p>${L(d.ldiFinal)}</section>
    `;
}

function departmentReportBody(d: LetterData): string {
  const L = reportListHTML;
  const tech = d.reportDepartment === 'Technical' && (d.reportTechAIML || d.reportTechProduct || d.reportTechDevOps)
    ? `
      <section class="report-section"><h3>Technical Track Senior Consultants</h3>
      <table class="report-table"><thead><tr><th>Track</th><th>Senior Consultant</th></tr></thead><tbody>
        ${d.reportTechAIML ? `<tr><td>AI/ML</td><td>${h(d.reportTechAIML)}</td></tr>` : ''}
        ${d.reportTechProduct ? `<tr><td>Product</td><td>${h(d.reportTechProduct)}</td></tr>` : ''}
        ${d.reportTechDevOps ? `<tr><td>DevOps</td><td>${h(d.reportTechDevOps)}</td></tr>` : ''}
      </tbody></table></section>`
    : '';
  return `
      <div class="report-meta-grid">
        <div><div class="report-meta-label">Department</div><strong>${h(d.reportDepartment)}</strong></div>
        <div><div class="report-meta-label">Director</div><strong>${h(d.reportDirector)}</strong></div>
        <div><div class="report-meta-label">Date</div><strong>${h(d.dateStr)}</strong></div>
        <div><div class="report-meta-label">Time</div><strong>${h(d.reportTime || '(not specified)')}</strong></div>
        <div><div class="report-meta-label">Department Strength</div><strong>${h(d.reportStrength || '0')}</strong></div>
        <div><div class="report-meta-label">Reference</div><strong>${h(d.docnum)}</strong></div>
      </div>
      <section class="report-section"><h3>Overview</h3>${L(d.reportOverview)}</section>
      <section class="report-section"><h3>Tasks at Hand</h3>${L(d.reportTasks)}</section>
      <section class="report-section"><h3>Update on Tasks</h3>${L(d.reportUpdates)}</section>
      <section class="report-section"><h3>What is on hold, if anything, and why?</h3>${L(d.reportHold)}</section>
      <section class="report-section"><h3>Struggles</h3>${L(d.reportStruggles)}</section>
      <section class="report-section"><h3>Strengths</h3>${L(d.reportStrengths)}</section>
      <section class="report-section"><h3>Other Things to Mention</h3>${L(d.reportOther)}</section>
      <section class="report-section"><h3>Vision</h3>${L(d.reportVision)}</section>
      <section class="report-section"><h3>Responsibility</h3>${L(d.reportResponsibility)}</section>
      <section class="report-section"><h3>Subteams and Members</h3>${reportSubteamTableHTML(d.reportSubteams)}</section>
      <section class="report-section"><h3>Senior Consultants and Level of Activity</h3>${reportSeniorTableHTML(d.reportSenior)}</section>
      ${tech}
      <section class="report-section"><h3>Promising People in the Department</h3>${L(d.reportPromising)}</section>
      <section class="report-section"><h3>Director's Closing Note</h3><p>This report records the current position, responsibilities, priorities, people structure, and forward direction of the department.</p></section>
    `;
}

function announcementBody(d: LetterData): string {
  const tone = announcementTone(d.announcementTone);
  const event = d.announcementKind === 'event'
    ? `
        <div class="announcement-event-card">
          <p><strong>Event Details</strong></p>
          <div class="announcement-event-grid">
            <div><span class="announcement-event-label">Date:</span> ${h(d.announcementEventDate || '(not specified)')}</div>
            <div><span class="announcement-event-label">Time:</span> ${h(d.announcementEventTime || '(not specified)')}</div>
            <div class="event-wide"><span class="announcement-event-label">Venue:</span> ${h(d.announcementEventVenue || '(not specified)')}</div>
            <div><span class="announcement-event-label">Mode:</span> ${h(d.announcementEventMode || 'In-person')}</div>
            ${d.announcementEventAction ? `<div><span class="announcement-event-label">Action:</span> ${h(d.announcementEventAction)}</div>` : ''}
            ${d.announcementEventNotes ? `<div class="event-wide"><span class="announcement-event-label">Notes:</span> ${h(d.announcementEventNotes)}</div>` : ''}
          </div>
        </div>`
    : '';
  return `
      <p><strong>${h(tone.intro)}</strong></p>
      <p><strong>From:</strong> ${h(d.announcementSender || '(sender)')}</p>
      <p>${h(d.announcementMessage).replace(/\n/g, '<br>')}</p>
      ${event}
      ${d.announcementFileName ? `<div class="announcement-attachment"><strong>Attachment:</strong> ${h(d.announcementFileName)}</div>` : ''}
      <p>${h(tone.end)}</p>
    `;
}

function mouBody(d: LetterData): string {
  return `
      <p><strong>MEMORANDUM OF UNDERSTANDING</strong></p>
      <p>This MOU sets out the understanding between <strong>180 Degrees Consulting, VIT Chennai Chapter</strong> and <strong>${h(d.mouParty)}</strong> for the collaboration described below.</p>
      <p><strong>Other Party.</strong> ${h(d.mouParty)}${d.mouAddress ? `, ${h(d.mouAddress)}` : ''}.</p>
      <p><strong>Effective Date.</strong> ${h(d.dateStr)}.</p>
      <p><strong>Purpose.</strong> ${h(d.mouPurpose)}</p>
      <p><strong>Scope of Collaboration.</strong> ${h(d.mouScope)}</p>
      <p><strong>Responsibilities of 180 Degrees Consulting.</strong> ${h(d.mouRespOurs)}</p>
      <p><strong>Responsibilities of Other Party.</strong> ${h(d.mouRespOther)}</p>
      <p><strong>Documents / Deliverables.</strong> ${h(d.mouDocs)}</p>
      <p><strong>Term.</strong> This MOU shall remain in force for <strong>${h(d.mouTerm)}</strong>, unless extended or terminated in accordance with its terms.</p>
      <p><strong>Confidentiality.</strong> ${h(d.mouConfidentiality)}</p>
      <p><strong>Termination.</strong> ${h(d.mouTermination)}</p>
      <p><strong>General Understanding.</strong> Any amendment to this MOU shall be made in writing and agreed by both Parties. This MOU records the Parties' present understanding regarding the collaboration and does not create an employment relationship between the Parties.</p>
      <p>IN WITNESS WHEREOF, the Parties have caused this MOU to be acknowledged by their respective authorised signatories.</p>
      <p><strong>For 180 Degrees Consulting, VIT Chennai</strong><br>${h(d.mouSignOurs || 'Authorised Signatory')}</p>
      <p><strong>For ${h(d.mouParty)}</strong><br>${h(d.mouSignOther || 'Authorised Signatory')}</p>`;
}

function memberBody(d: LetterData, type: Exclude<WrappedType, 'mou' | 'announcement' | 'department-report' | 'ldi'>): string {
  const particulars = `<table class="particulars">${particularsHTML(d)}</table>`;
  switch (type) {
    case 'promotion':
      return `
      <p><strong>Dear ${h(d.name)},</strong></p>
      <p>This Letter of Promotion (&ldquo;<strong>Letter</strong>&rdquo;) is ${ORG_INTRO} in favour of the member named herein, for the tenure 2026-27.</p>
      <p>The particulars of this promotion are recorded below for reference:</p>
      ${particulars}
      <p><strong>Promotion.</strong> Effective immediately, you are promoted from <strong>${h(d.positionFrom)}</strong> to <strong>${h(d.positionTo)}</strong> in the Organisation.</p>
      <p><strong>Promotion Details.</strong> Previous designation: <strong>${h(d.positionFrom)}</strong>. New designation: <strong>${h(d.positionTo)}</strong>. Performance: <strong>${h(d.performance)}</strong>.</p>
      <p><strong>Duties.</strong> You shall assume the duties and responsibilities of ${h(d.positionTo)} in the ${h(d.team)} department, as directed by the Board.</p>
      <p><strong>Conduct.</strong> You shall maintain professional and confidential standards, and follow the Board's directives.</p>
      <p>We congratulate you on your promotion and look forward to your continued contribution.</p>
      <p><em>In witness whereof, this Letter is issued and authenticated by the undersigned on behalf of the Organisation.</em></p>
      <p>Warm regards,</p>`;
    case 'termination':
      return `
      <p><strong>Dear ${h(d.name)},</strong></p>
      <p>This Letter of Termination (&ldquo;<strong>Letter</strong>&rdquo;) is ${ORG_INTRO} in respect of the member named herein.</p>
      <p>The particulars of this termination are recorded below for reference:</p>
      ${particulars}
      <p><strong>Termination Details.</strong> Performance: <strong>${h(d.performance)}</strong>. Reason: ${h(d.reason || '(reason to be specified)')}</p>
      <p><strong>Termination.</strong> Effective immediately, pursuant to the <strong>Board's unanimous decision</strong>, your association with the Organisation in the capacity of <strong>${h(d.position)}</strong> stands terminated, and you are hereby <strong>relieved from your duties and responsibilities</strong> with the Organisation.</p>
      <p><strong>Handover.</strong> You are requested to complete any pending handover or return any Organisation property, records, or materials, as applicable.</p>
      <p><em>This Letter is issued and authenticated by the undersigned on behalf of the Organisation.</em></p>
      <p>Regards,</p>`;
    case 'transfer':
      return `
      <p><strong>Dear ${h(d.name)},</strong></p>
      <p>This Letter of Department Transfer (&ldquo;<strong>Letter</strong>&rdquo;) is ${ORG_INTRO} in respect of the member named herein, for the tenure 2026-27.</p>
      <p>The particulars of this transfer are recorded below for reference:</p>
      ${particulars}
      <p><strong>Transfer Details.</strong> Department From: <strong>${h(d.teamFrom)}</strong>. Department To: <strong>${h(d.teamTo)}</strong>.</p>
      <p><strong>Transfer.</strong> Effective immediately, you are transferred from <strong>${h(d.teamFrom)}</strong> to <strong>${h(d.teamTo)}</strong> and shall serve in the new department in your current capacity.</p>
      <p><strong>Duties.</strong> You shall assume the duties and responsibilities assigned to you by the leadership of ${h(d.teamTo)}, and shall comply with all applicable directions and procedures.</p>
      <p><strong>Conduct.</strong> You shall maintain professional and confidential standards and continue to comply with the Organisation's policies and directives.</p>
      <p>We wish you success in your new department and look forward to your continued contribution.</p>
      <p><em>In witness whereof, this Letter is issued and authenticated by the undersigned on behalf of the Organisation.</em></p>
      <p>Warm regards,</p>`;
    case 'resignation':
      return `
      <p><strong>Dear ${h(d.name)},</strong></p>
      <p>This Letter of Resignation records the voluntary resignation of the member named herein from 180 Degrees Consulting, VIT Chennai Chapter (the &ldquo;<strong>Organisation</strong>&rdquo;).</p>
      <p>The particulars of this resignation are recorded below for reference:</p>
      ${particulars}
      <p><strong>Resignation.</strong> I hereby submit my resignation from the Organisation. My reason for leaving is: <strong>${h(d.resignationReason || '(reason to be specified)')}</strong>.</p>
      <p><strong>Work Satisfaction.</strong> My overall satisfaction with my work and experience in the Organisation is rated as <strong>${h(d.satisfaction || '(not specified)')}</strong>.</p>
      <p><strong>Successor Recommendation.</strong> ${h(d.successor || 'No successor recommendation has been provided.')}</p>
      ${d.resignationFeedback ? `<p><strong>Additional Remarks.</strong> ${h(d.resignationFeedback)}</p>` : ''}
      <p>I undertake to complete any pending handover and return Organisation property, records, or materials, as applicable.</p>
      <p>Thank you for the opportunities, learning, and experience during my association with the Organisation.</p>
      <p>Yours sincerely,</p>
      <div class="resignation-signature">
        <div class="signature-name"><strong>${h(d.name)}</strong></div>
        <div>${h(d.position)}</div>
        <div>${h(d.team)}</div>
        <div>Registration Number: ${h(d.reg)}</div>
      </div>`;
    case 'showcause':
      return `
      <p><strong>Dear ${h(d.name)},</strong></p>
      <p>This Show-Cause / Warning Letter is issued by the Faculty Coordinator, <strong>Dr. Balaji J</strong>, regarding the matter recorded below.</p>
      ${particulars}
      <p><strong>Matter.</strong> ${h(d.scType)}: ${h(d.scIncident)}</p>
      <p><strong>Date &amp; Time.</strong> ${h(d.scDate || '(not specified)')} ${h(d.scTime || '')}</p>
      <p><strong>Remarks.</strong> ${h(d.scRemark || '(none provided)')}</p>
      <p>You are hereby required to provide an explanation regarding the above matter and to ensure that such concerns are addressed appropriately. This letter is issued as a formal warning and for record purposes.</p>
      <p>Regards,</p>`;
    case 'service':
      return `
      <p><strong>To Whom It May Concern,</strong></p>
      <p>This is to certify that <strong>${h(d.name)}</strong>, Registration Number <strong>${h(d.reg)}</strong>, served in the ${h(d.team)} department as <strong>${h(d.position)}</strong> with 180 Degrees Consulting, VIT Chennai Chapter.</p>
      <p><strong>Service Details.</strong> ${h(d.name)} worked on <strong>${h(d.serviceProjects)}</strong> project(s), in the position(s) of <strong>${h(d.servicePositions)}</strong>.</p>
      <p><strong>Outcome.</strong> ${h(d.serviceOutcome)}</p>
      <p>During the period of association, the member contributed to the Organisation's activities and responsibilities in the capacity stated above.</p>
      <p>This certificate is issued upon request for official and professional purposes.</p>
      <p>Warm regards,</p>`;
    case 'relieving':
      return `
      <p><strong>Dear ${h(d.name)},</strong></p>
      <p>This is to acknowledge and accept your resignation from 180 Degrees Consulting, VIT Chennai Chapter, and to formally relieve you from your duties and responsibilities with the Organisation, subject to completion of the applicable handover requirements.</p>
      ${particulars}
      <p><strong>Work Assessment.</strong> ${h(d.relievingRating)}. ${h(d.relievingComment || '')}</p>
      <p>We thank you for your contribution and wish you continued success in your future endeavours.</p>
      <p>Warm regards,</p>`;
    case 'recognition':
      return `
      <p><strong>Dear ${h(d.name)},</strong></p>
      <p>We are pleased to recognise and appreciate your contribution to 180 Degrees Consulting, VIT Chennai Chapter.</p>
      ${particulars}
      <p><strong>Task / Contribution.</strong> ${h(d.recTask)}</p>
      <p><strong>Outcome.</strong> ${h(d.recOutcome)}</p>
      <p>Thank you for your effort, commitment, and contribution. We appreciate the work you have undertaken and look forward to your continued involvement and contribution to the Organisation.</p>
      <p>Warm regards,</p>`;
    default:
      return assertNever(type);
  }
}

function bodyHTML(d: LetterData, type: WrappedType): string {
  switch (type) {
    case 'ldi':
      return ldiBody(d);
    case 'department-report':
      return departmentReportBody(d);
    case 'announcement':
      return announcementBody(d);
    case 'mou':
      return mouBody(d);
    default:
      return memberBody(d, type);
  }
}

const sig = (name: string, role: string): string => `<td><span class="name">${name}</span>${role}<div class="digisig">Digitally Signed</div></td>`;
const BOARD_ROW = `<tr class="four">
      ${sig('Sharan K', 'Chairperson<br>180 Degrees Consulting')}
      ${sig('Sanjana Chejeti', 'Vice Chairperson<br>180 Degrees Consulting')}
      ${sig('Sonakshi Agarwal', 'Gen Secretary<br>180 Degrees Consulting')}
      ${sig('Sanjay Sivakumar', 'Secretary<br>180 Degrees Consulting')}
    </tr>`;
const FACULTY = '<span class="name">Dr. Balaji J</span>Faculty Coordinator<br>180 Degrees Consulting, VIT Chennai<div class="digisig">Digitally Signed</div>';

function signatureRowsHTML(d: LetterData, type: WrappedType): string {
  switch (type) {
    case 'ldi':
      return `<tr>
      <td colspan="3" class="report-sign"><span class="name">${h(d.ldiSubmitter || '(submitter)')}</span>${h(d.ldiPosition || 'Proposer')}<div class="digisig">Digitally Signed</div></td>
    </tr>`;
    case 'department-report':
      return `<tr>
      <td colspan="3" class="report-sign"><span class="name">${h(d.reportDirector || '(director)')}</span>Director, ${h(d.reportDepartment)}<div class="digisig">Digitally Signed</div></td>
    </tr>`;
    case 'announcement':
      return `<tr>
      <td colspan="3" class="announcement-sign"><span class="name sig-name">${h(d.announcementSender || '(sender)')}</span>${h(d.announcementSenderPosition || 'Sender')}<div class="digisig">Digitally Signed</div></td>
    </tr>`;
    case 'mou':
      return `<tr>
      ${sig(h(d.mouSignOurs || 'Authorised Signatory'), '180 Degrees Consulting, VIT Chennai')}
      ${sig(h(d.mouSignOther || 'Authorised Signatory'), h(d.mouParty))}
    </tr>`;
    case 'showcause':
      return `<tr>
      <td colspan="3">${FACULTY}</td>
    </tr>`;
    case 'recognition':
      return `${BOARD_ROW}<tr>
      <td colspan="4">${FACULTY}</td>
    </tr>`;
    default:
      return BOARD_ROW;
  }
}

/**
 * Single-page source markup for a letter (legacy `buildLetterHTML`). The
 * content goes inside an element with the layout's `pageClass`; render.ts
 * paginates `.body` children and keeps `table.sig` on the last page only.
 */
export function buildLetterHTML(d: LetterData): string {
  const type = d.type;
  if (type === 'appointment') return appointmentHTML(d);
  const leftLogo = type === 'mou'
    ? (d.mouLogo ? `<img class="logoimg mou-party-logo" src="${h(d.mouLogo)}" alt="Other Party logo">` : '')
    : `<img class="logoimg vit-logo" src="${LETTER_VIT_LOGO}" alt="VIT logo">`;
  return `
    <div class="watermark"></div>
    <div class="pagecontent">
    <div class="letterhead">
      <div class="logo-col left">
        ${leftLogo}
      </div>
      <div class="logo-col right">
        <img class="logoimg dc-logo" src="${LETTER_DC_LOGO}" alt="180DC logo">
      </div>
    </div>
    <hr class="hr1">
    <div class="lettertitle"><div class="main">${TITLES[type]}</div><div class="sub">180 Degrees Consulting | Tenure 2026-27</div></div>
    <hr class="hr2">
    <div class="datebar">Date: ${h(d.dateStr)}<div class="docnum">Ref. No.: ${h(d.docnum)}</div></div>
    <div class="body">${bodyHTML(d, type)}</div>
    <table class="sig">${signatureRowsHTML(d, type)}</table>
    </div>`;
}

function fnv1a32(str: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Legacy-compatible reference: FNV-1a over trimmed identity fields (date excluded). Not unique. */
export function docNumber(
  type: string,
  name: string,
  reg: string,
  team: string,
  positionFrom: string,
  positionTo: string,
  teamFrom = '',
  teamTo = '',
  extra = '',
): string {
  const key = `${type.trim()}|${name.trim()}|${reg.trim()}|${team.trim()}|${positionFrom.trim()}|${positionTo.trim()}|${teamFrom.trim()}|${teamTo.trim()}|${extra.trim()}`;
  return '180DC-' + fnv1a32(key).toString(16).toUpperCase().padStart(8, '0');
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'] as const;

/** `YYYY-MM-DD` -> `17 October 2026`; anything else -> "". */
export function fmtDate(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return '';
  const [, y, m, d] = match;
  const month = MONTHS[Number(m) - 1];
  return month ? `${Number(d)} ${month} ${y}` : '';
}

/** Build the immutable letter model from studio form state (legacy `collectLetterData`). */
export function collectLetterData(form: LetterForm, mouLogoData = '', announcementFileName = ''): LetterData {
  const val = (id: LetterFormField, fallback = ''): string => form[id] || fallback;
  const txt = (id: LetterFormField): string => val(id).trim();
  const rawType = form['f-type'] || 'appointment';
  const type: LetterType = isLetterType(rawType) ? rawType : 'appointment';
  const is = (t: LetterType): boolean => type === t;
  const isAnnouncement = is('announcement');
  const isReport = is('department-report');
  const isLDI = is('ldi');
  const isMOU = is('mou');
  const isEvent = isAnnouncement && form['f-announcement-kind'] === 'event';
  const only = (cond: boolean, value: string): string => (cond ? value : '');

  const name = isAnnouncement
    ? '(announcement)'
    : isReport
      ? txt('f-report-director') || '(director)'
      : isLDI
        ? txt('f-ldi-submitter') || '(submitter)'
        : txt('f-name') || '(name)';
  const reg = isAnnouncement || isReport ? '(not applicable)' : txt('f-reg').toUpperCase() || '(REGISTRATION NUMBER)';
  const position = isReport ? 'Director' : isLDI ? txt('f-ldi-position') || 'Proposer' : val('f-position', 'Junior Consultant');
  const positionFrom = is('promotion') ? val('f-position-from', position) : position;
  const positionTo = is('promotion') ? val('f-position-to', position) : position;
  const team = is('transfer') ? val('f-team-from') : isReport ? val('f-report-department') : isLDI ? val('f-ldi-department') : val('f-team');
  const teamFrom = is('transfer') ? val('f-team-from') : team;
  const teamTo = is('transfer') ? val('f-team-to') : team;
  const extra = isAnnouncement
    ? [val('f-announcement-sender'), val('f-announcement-tone'), val('f-announcement-kind'), val('f-announcement-message')].join('|')
    : isReport
      ? [val('f-report-time'), val('f-report-overview'), val('f-report-tasks'), val('f-report-updates'), val('f-report-strength'), val('f-report-tech-aiml'), val('f-report-tech-product'), val('f-report-tech-devops')].join('|')
      : isLDI
        ? [val('f-ldi-title'), val('f-ldi-department'), val('f-ldi-category'), val('f-ldi-summary'), val('f-ldi-outcome'), val('f-ldi-cost'), val('f-ldi-timeline')].join('|')
        : '';

  return Object.freeze({
    type,
    dateStr: fmtDate(val('f-date')) || '(select date)',
    name,
    reg,
    position,
    positionFrom,
    positionTo,
    team,
    teamFrom,
    teamTo,
    ffcs: val('f-ffcs', 'FFCS'),
    techTrack: val('f-tech-track'),
    performance: only(is('promotion') || is('termination'), val('f-performance')),
    reason: only(is('termination'), txt('f-reason')),
    resignationReason: only(is('resignation'), txt('f-resignation-reason')),
    satisfaction: only(is('resignation'), val('f-satisfaction')),
    successor: only(is('resignation'), txt('f-successor')),
    resignationFeedback: only(is('resignation'), txt('f-resignation-feedback')),
    scType: only(is('showcause'), val('f-sc-type')),
    scIncident: only(is('showcause'), txt('f-sc-incident')),
    scDate: only(is('showcause'), fmtDate(val('f-sc-date'))),
    scTime: only(is('showcause'), val('f-sc-time')),
    scRemark: only(is('showcause'), txt('f-sc-remark')),
    serviceProjects: only(is('service'), txt('f-service-projects')),
    servicePositions: only(is('service'), txt('f-service-positions')),
    serviceOutcome: only(is('service'), txt('f-service-outcome')),
    relievingRating: only(is('relieving'), val('f-relieving-rating')),
    relievingComment: only(is('relieving'), txt('f-relieving-comment')),
    recTask: only(is('recognition'), txt('f-rec-task')),
    recOutcome: only(is('recognition'), txt('f-rec-outcome')),
    mouParty: only(isMOU, txt('f-mou-party')),
    mouAddress: only(isMOU, txt('f-mou-address')),
    mouPurpose: only(isMOU, txt('f-mou-purpose')),
    mouScope: only(isMOU, txt('f-mou-scope')),
    mouRespOurs: only(isMOU, txt('f-mou-resp-ours')),
    mouRespOther: only(isMOU, txt('f-mou-resp-other')),
    mouDocs: only(isMOU, txt('f-mou-docs')),
    mouTerm: only(isMOU, txt('f-mou-term')),
    mouConfidentiality: only(isMOU, txt('f-mou-confidentiality')),
    mouTermination: only(isMOU, txt('f-mou-termination')),
    mouSignOurs: only(isMOU, txt('f-mou-sign-ours')),
    mouSignOther: only(isMOU, txt('f-mou-sign-other')),
    mouLogo: only(isMOU, mouLogoData),
    announcementSender: only(isAnnouncement, txt('f-announcement-sender')),
    announcementSenderPosition: only(isAnnouncement, val('f-announcement-sender-position')),
    announcementTone: only(isAnnouncement, val('f-announcement-tone')),
    announcementKind: only(isAnnouncement, val('f-announcement-kind')),
    announcementMessage: only(isAnnouncement, txt('f-announcement-message')),
    announcementFileName: only(isAnnouncement, announcementFileName),
    announcementFileData: '',
    announcementEventDate: only(isEvent, fmtDate(val('f-announcement-event-date'))),
    announcementEventTime: only(isEvent, val('f-announcement-event-time')),
    announcementEventVenue: only(isEvent, txt('f-announcement-event-venue')),
    announcementEventMode: only(isEvent, val('f-announcement-event-mode')),
    announcementEventAction: only(isEvent, txt('f-announcement-event-action')),
    announcementEventNotes: only(isEvent, txt('f-announcement-event-notes')),
    reportTime: only(isReport, val('f-report-time')),
    reportDirector: only(isReport, txt('f-report-director')),
    reportDepartment: only(isReport, val('f-report-department')),
    reportOverview: only(isReport, txt('f-report-overview')),
    reportTasks: only(isReport, txt('f-report-tasks')),
    reportUpdates: only(isReport, txt('f-report-updates')),
    reportHold: only(isReport, txt('f-report-hold')),
    reportStruggles: only(isReport, txt('f-report-struggles')),
    reportStrengths: only(isReport, txt('f-report-strengths')),
    reportOther: only(isReport, txt('f-report-other')),
    reportVision: only(isReport, txt('f-report-vision')),
    reportResponsibility: only(isReport, txt('f-report-responsibility')),
    reportStrength: only(isReport, val('f-report-strength')),
    reportSubteams: only(isReport, txt('f-report-subteams')),
    reportSenior: only(isReport, txt('f-report-senior')),
    reportPromising: only(isReport, txt('f-report-promising')),
    reportTechAIML: only(isReport, txt('f-report-tech-aiml')),
    reportTechProduct: only(isReport, txt('f-report-tech-product')),
    reportTechDevOps: only(isReport, txt('f-report-tech-devops')),
    ldiSubmitter: only(isLDI, txt('f-ldi-submitter')),
    ldiPosition: only(isLDI, txt('f-ldi-position')),
    ldiDepartment: only(isLDI, val('f-ldi-department')),
    ldiCategory: only(isLDI, val('f-ldi-category')),
    ldiDate: only(isLDI, fmtDate(val('f-ldi-date'))),
    ldiPriority: only(isLDI, val('f-ldi-priority')),
    ldiTitle: only(isLDI, txt('f-ldi-title')),
    ldiSummary: only(isLDI, txt('f-ldi-summary')),
    ldiProblem: only(isLDI, txt('f-ldi-problem')),
    ldiWhy: only(isLDI, txt('f-ldi-why')),
    ldiHow: only(isLDI, txt('f-ldi-how')),
    ldiExpect: only(isLDI, txt('f-ldi-expect')),
    ldiOutcome: only(isLDI, txt('f-ldi-outcome')),
    ldiBeneficiaries: only(isLDI, txt('f-ldi-beneficiaries')),
    ldiImpact: only(isLDI, txt('f-ldi-impact')),
    ldiMetrics: only(isLDI, txt('f-ldi-metrics')),
    ldiCost: only(isLDI, txt('f-ldi-cost')),
    ldiResources: only(isLDI, txt('f-ldi-resources')),
    ldiAllocation: only(isLDI, txt('f-ldi-allocation')),
    ldiDependencies: only(isLDI, txt('f-ldi-dependencies')),
    ldiGuesstimate: only(isLDI, txt('f-ldi-guesstimate')),
    ldiAssumptions: only(isLDI, txt('f-ldi-assumptions')),
    ldiEvidence: only(isLDI, txt('f-ldi-evidence')),
    ldiTimeline: only(isLDI, txt('f-ldi-timeline')),
    ldiMilestones: only(isLDI, txt('f-ldi-milestones')),
    ldiPilot: only(isLDI, txt('f-ldi-pilot')),
    ldiRollout: only(isLDI, txt('f-ldi-rollout')),
    ldiRisks: only(isLDI, txt('f-ldi-risks')),
    ldiTradeoffs: only(isLDI, txt('f-ldi-tradeoffs')),
    ldiAlternatives: only(isLDI, txt('f-ldi-alternatives')),
    ldiScope: only(isLDI, txt('f-ldi-scope')),
    ldiOwner: only(isLDI, txt('f-ldi-owner')),
    ldiStakeholders: only(isLDI, txt('f-ldi-stakeholders')),
    ldiSupporters: only(isLDI, txt('f-ldi-supporters')),
    ldiOpponents: only(isLDI, txt('f-ldi-opponents')),
    ldiApprovals: only(isLDI, txt('f-ldi-approvals')),
    ldiCommunication: only(isLDI, txt('f-ldi-communication')),
    ldiMaintenance: only(isLDI, txt('f-ldi-maintenance')),
    ldiDecision: only(isLDI, val('f-ldi-decision')),
    ldiReview: only(isLDI, txt('f-ldi-review')),
    ldiNext: only(isLDI, txt('f-ldi-next')),
    ldiFinal: only(isLDI, txt('f-ldi-final')),
    docnum: docNumber(type, name, reg, team, positionFrom, positionTo, teamFrom, teamTo, extra),
  });
}

export type LetterValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly field: LetterFormField; readonly message: string };

/**
 * Pre-print/PDF/send checks from the legacy studio (same rules and messages).
 * `field` is the first missing or invalid form id. Deliberate change: an MOU is
 * checked on its agreement fields only, without a member name/registration.
 */
export function validateLetterForm(form: LetterForm): LetterValidation {
  const filled = (id: LetterFormField): boolean => (form[id] || '').trim() !== '';
  const fail = (field: LetterFormField, message: string): LetterValidation => ({ ok: false, field, message });
  const firstMissing = (ids: readonly LetterFormField[]): LetterFormField | undefined => ids.find((id) => !filled(id));
  const rawType = form['f-type'] || 'appointment';
  const type: LetterType = isLetterType(rawType) ? rawType : 'appointment';

  if (type === 'announcement') {
    const missing = firstMissing(['f-announcement-sender', 'f-announcement-message']);
    if (missing) return fail(missing, 'Please complete the announcement sender and message fields.');
    const eventMissing = (form['f-announcement-kind'] || 'general') === 'event'
      ? firstMissing(['f-announcement-event-date', 'f-announcement-event-time', 'f-announcement-event-venue'])
      : undefined;
    return eventMissing ? fail(eventMissing, 'Please complete the event date, time, and venue.') : { ok: true };
  }
  if (type === 'ldi') {
    const missing = firstMissing(['f-ldi-submitter', 'f-ldi-title', 'f-ldi-summary', 'f-ldi-problem', 'f-ldi-outcome']);
    return missing ? fail(missing, 'Please complete the LDI submitter, title, overview, problem / opportunity, and expected outcome fields.') : { ok: true };
  }
  if (type === 'department-report') {
    return filled('f-report-director') ? { ok: true } : fail('f-report-director', 'Please enter the department director name.');
  }
  if (type === 'mou') {
    const missing = firstMissing(['f-mou-party', 'f-mou-purpose', 'f-mou-scope', 'f-mou-resp-ours', 'f-mou-resp-other', 'f-mou-docs', 'f-mou-term', 'f-mou-confidentiality', 'f-mou-termination']);
    return missing ? fail(missing, 'For an MOU, complete the party, purpose, scope, responsibilities, documents/deliverables, term, confidentiality, and termination fields.') : { ok: true };
  }
  if (!filled('f-name')) return fail('f-name', 'Enter the member name.');
  if (type !== 'appointment' && !REG_PATTERN.test((form['f-reg'] || '').trim().toUpperCase())) {
    return fail('f-reg', 'Registration number format must be 2 digits + B/M + 2 letters + 4 digits, with the 4-digit block starting 1-9. Example: 25BCE1234.');
  }
  const missing =
    type === 'showcause' ? firstMissing(['f-sc-incident'])
    : type === 'service' ? firstMissing(['f-service-projects', 'f-service-positions', 'f-service-outcome'])
    : type === 'recognition' ? firstMissing(['f-rec-task', 'f-rec-outcome'])
    : type === 'termination' ? firstMissing(['f-reason'])
    : type === 'resignation' ? firstMissing(['f-resignation-reason'])
    : undefined;
  if (missing) {
    const messages: Partial<Record<LetterType, string>> = {
      showcause: 'Please enter the incident / absence details.',
      service: 'Please complete the service certificate details.',
      recognition: 'Please complete the recognition details.',
      termination: 'Enter a reason for termination.',
      resignation: 'Enter a reason for leaving.',
    };
    return fail(missing, messages[type] ?? 'Please complete the required fields.');
  }
  if (type === 'transfer' && (form['f-team-from'] || '') === (form['f-team-to'] || '')) return fail('f-team-to', 'Choose a different destination department.');
  return { ok: true };
}

export function assertNever(value: never): never {
  throw new TypeError(`Unexpected letter type: ${String(value)}`);
}
