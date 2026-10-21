import type { CrmLostReason, CrmProposalStatus, CrmStageKind } from '@schema';

/** Mailbox providers whose domain says nothing about the organisation. */
const PERSONAL_MAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'outlook.com', 'hotmail.com', 'live.com', 'msn.com',
  'icloud.com', 'me.com', 'aol.com', 'proton.me', 'protonmail.com', 'rediffmail.com', 'zoho.com', 'yandex.com', 'gmx.com',
]);

/**
 * The bare host of a website, URL or email address: lower case, without scheme,
 * credentials, port, path or a leading "www."; null when it is not a host name.
 */
export function normalizeDomain(input: string | null | undefined): string | null {
  const raw = input?.trim().toLowerCase();
  if (!raw) return null;
  const host = raw.includes('@') && !raw.includes('/') ? raw.slice(raw.lastIndexOf('@') + 1) : hostOf(raw);
  const bare = host?.replace(/\.$/, '').replace(/^www\./, '');
  return bare && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(bare) ? bare : null;
}

function hostOf(value: string): string | null {
  try {
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//.test(value) ? value : `https://${value}`).hostname;
  } catch {
    return null;
  }
}

/** The organisation domain behind an email address, or null for personal mailboxes. */
export function organizationDomainOfEmail(email: string): string | null {
  const domain = normalizeDomain(email.includes('@') ? email : null);
  return domain && !PERSONAL_MAIL_DOMAINS.has(domain) ? domain : null;
}

export function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase();
  return value ? value : null;
}

const LEGAL_SUFFIXES = new Set(['pvt', 'private', 'ltd', 'limited', 'inc', 'llp', 'llc', 'co', 'the']);

/** A comparable organisation name: punctuation, case and legal suffixes removed. */
export function normalizeOrganizationName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((word) => word && !LEGAL_SUFFIXES.has(word))
    .join(' ');
}

export interface StageRef {
  readonly id: string;
  readonly kind: CrmStageKind;
  readonly active: boolean;
}

export type StageMove =
  | { readonly ok: true; readonly lostReason: CrmLostReason | null; readonly closed: boolean }
  | { readonly ok: false; readonly error: 'opportunity_closed' | 'same_stage' | 'stage_inactive' | 'won_requires_accepted_proposal' | 'lost_reason_required' };

/**
 * Whether an opportunity may move between stages. Won is reached only by
 * accepting a proposal and is final; lost needs a reason code; a lost
 * opportunity may be reopened into an open stage, which clears the reason.
 */
export function stageMove(from: StageRef, to: StageRef, lostReason: CrmLostReason | null | undefined): StageMove {
  if (from.kind === 'won') return { ok: false, error: 'opportunity_closed' };
  if (from.id === to.id) return { ok: false, error: 'same_stage' };
  if (!to.active) return { ok: false, error: 'stage_inactive' };
  switch (to.kind) {
    case 'won':
      return { ok: false, error: 'won_requires_accepted_proposal' };
    case 'lost':
      return lostReason ? { ok: true, lostReason, closed: true } : { ok: false, error: 'lost_reason_required' };
    case 'open':
      return { ok: true, lostReason: null, closed: false };
    default:
      return assertNever(to.kind);
  }
}

const PROPOSAL_NEXT: Record<CrmProposalStatus, readonly CrmProposalStatus[]> = {
  draft: ['sent', 'declined'],
  sent: ['accepted', 'declined'],
  accepted: [],
  declined: [],
};

export function canMoveProposal(from: CrmProposalStatus, to: CrmProposalStatus): boolean {
  return PROPOSAL_NEXT[from].includes(to);
}

/** A new version may be written while the proposal is undecided; it returns the proposal to draft. */
export function canReviseProposal(status: CrmProposalStatus): boolean {
  return status === 'draft' || status === 'sent';
}

export interface CloseoutChecklist {
  readonly deliverablesAccepted: boolean;
  readonly filesArchived: boolean;
  readonly knowledgeTransferDone: boolean;
}

/** Checklist items still open before an engagement may close. */
export function closeoutMissing(checklist: CloseoutChecklist): Array<keyof CloseoutChecklist> {
  return (['deliverablesAccepted', 'filesArchived', 'knowledgeTransferDone'] as const).filter((key) => !checklist[key]);
}

function assertNever(value: never): never {
  throw new Error(`unexpected value: ${String(value)}`);
}
