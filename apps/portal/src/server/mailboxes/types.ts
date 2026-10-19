/** These capabilities are mailbox-local, never global role permissions. */
export const MAILBOX_CAPABILITIES = [
  'mailbox.read', 'mailbox.draft.create', 'mailbox.draft.edit_own', 'mailbox.draft.edit_any',
  'mailbox.draft.submit', 'mailbox.review', 'mailbox.approve', 'mailbox.send',
  'mailbox.assign', 'mailbox.manage', 'mailbox.audit',
] as const;
export type MailboxCapability = (typeof MAILBOX_CAPABILITIES)[number];
export const MAILBOX_STATUSES = ['active', 'disabled', 'retired'] as const;
export const MAIL_ADAPTERS = ['disabled', 'capture', 'cloudflare'] as const;
export const MAIL_CATEGORIES = ['correspondence', 'outreach'] as const;
export const DRAFT_STATES = [
  'draft', 'submitted', 'changes_requested', 'rejected', 'approved', 'scheduled',
  'queued', 'sending', 'accepted', 'failed', 'outcome_unknown', 'cancelled',
] as const;
export type DraftState = (typeof DRAFT_STATES)[number];
export const INTENT_STATES = ['queued', 'sending', 'accepted', 'failed', 'outcome_unknown', 'cancelled', 'scheduled'] as const;
export const MAIL_FOLDERS = ['drafts', 'review', 'scheduled', 'sent', 'failed'] as const;
export type MailFolder = (typeof MAIL_FOLDERS)[number];
export type MailRecipients = { readonly to: readonly string[]; readonly cc: readonly string[]; readonly bcc: readonly string[] };
export type MailAttachment = {
  readonly id: string;
  readonly key: string;
  readonly filename: string;
  readonly contentType: string;
  readonly bytes: number;
  readonly digest: string;
};
export type SnapshotContent = {
  readonly mailboxId: string;
  readonly conversationId: string | null;
  readonly fromAddress: string;
  readonly fromName: string;
  readonly recipients: MailRecipients;
  readonly subject: string;
  readonly text: string;
  readonly html: string;
  readonly signature: string;
  readonly category: (typeof MAIL_CATEGORIES)[number];
  readonly attachments: readonly MailAttachment[];
  readonly templateVersionId: string | null;
};
