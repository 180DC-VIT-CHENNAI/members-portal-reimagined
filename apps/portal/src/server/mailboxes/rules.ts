import type { DraftState, MailFolder, MailRecipients, SnapshotContent } from './types';

export const FOLDER_STATES = {
  drafts: ['draft', 'submitted', 'changes_requested', 'approved'],
  review: ['submitted'],
  scheduled: ['scheduled', 'queued', 'sending'],
  sent: ['accepted'],
  failed: ['failed', 'outcome_unknown', 'cancelled', 'rejected'],
} as const satisfies Record<MailFolder, readonly DraftState[]>;

export function editable(state: DraftState): boolean {
  return ['draft', 'submitted', 'changes_requested', 'approved', 'scheduled', 'queued'].includes(state);
}

/** Stable canonical form includes every reviewed byte and recipient, including BCC. */
export function canonicalContent(content: SnapshotContent): string {
  return JSON.stringify([
    content.mailboxId, content.conversationId, content.fromAddress, content.fromName,
    content.recipients.to, content.recipients.cc, content.recipients.bcc,
    content.subject, content.text, content.html, content.signature, content.category,
    content.attachments.map((a) => [a.id, a.key, a.filename, a.contentType, a.bytes, a.digest]),
    content.templateVersionId,
  ]);
}

export async function digest(bytes: string | ArrayBuffer): Promise<string> {
  const input = typeof bytes === 'string' ? new TextEncoder().encode(bytes) : bytes;
  const hash = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join('');
}

export function recipientsValid(recipients: MailRecipients): boolean {
  const all = [...recipients.to, ...recipients.cc, ...recipients.bcc];
  return all.length > 0 && all.length <= 50 && new Set(all).size === all.length;
}
