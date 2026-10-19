import { devOutbox } from '@schema';
import { db } from 'void/db';
import { sendEmail, type Attachment, type SendEmailResult } from 'void/email';
import { emailTestMode } from '../email/send';
import { simulatedResult } from '../email/outcome';
import type { SnapshotContent } from './types';

export type TransportOutcome = {
  readonly state: 'accepted' | 'failed' | 'outcome_unknown';
  readonly messageId: string | null;
  readonly code: string | null;
  readonly recipientResults?: readonly {
    readonly recipient: string;
    readonly accepted: boolean;
    readonly messageId?: string;
    readonly code?: string;
  }[];
};
export interface MailTransport {
  send(input: { readonly content: SnapshotContent; readonly outboundId: string; readonly attachments: readonly Attachment[] }): Promise<TransportOutcome>;
}

export function transportOutcome(result: SendEmailResult): TransportOutcome {
  if (result.ok) return {
    state: 'accepted', messageId: result.ids.map((i) => i.messageId).join(','), code: null,
    recipientResults: result.ids.map((i) => ({ recipient: i.recipient, accepted: true, messageId: i.messageId })),
  };
  if ('error' in result) {
    return { state: result.error.code === 'OUTCOME_UNKNOWN' ? 'outcome_unknown' : 'failed', messageId: null, code: result.error.code };
  }
  // Partial acceptance must never become a replayable, supposedly failed whole send.
  const accepted = result.deliveries.some((d) => d.ok);
  const errors = result.deliveries.filter((d) => !d.ok);
  const uncertain = errors.find((d) => d.error.code === 'OUTCOME_UNKNOWN');
  return {
    state: accepted || uncertain ? 'outcome_unknown' : 'failed',
    messageId: null, code: accepted ? 'PARTIAL_ACCEPTANCE' : (uncertain?.error.code ?? errors[0]?.error.code ?? 'OUTCOME_UNKNOWN'),
    recipientResults: result.deliveries.map((d) => d.ok
      ? { recipient: d.recipient, accepted: true, messageId: d.messageId }
      : { recipient: d.recipient, accepted: false, code: d.error.code }),
  };
}

/** A business provider has not been selected; Cloudflare is restricted to replies. */
export const mailboxTransport: MailTransport = {
  async send({ content, outboundId, attachments }) {
    if (emailTestMode() === 'capture') {
      const recipients = [...content.recipients.to, ...content.recipients.cc, ...content.recipients.bcc];
      const outcomes = recipients.map((recipient) => ({ recipient, result: simulatedResult(recipient) }));
      for (const row of outcomes) {
        if (row.result.ok) {
          await db.insert(devOutbox).values({
            recipient: row.recipient, fromAddress: content.fromAddress, subject: content.subject, html: content.html,
            headers: { 'Reply-To': content.fromAddress, 'X-Outbound-ID': outboundId },
            attachments: attachments.map((a) => a.filename),
          });
        }
      }
      const classified = outcomes.map((o) => ({ recipient: o.recipient, outcome: transportOutcome(o.result) }));
      const recipientResults = classified.map((o) => ({
        recipient: o.recipient, accepted: o.outcome.state === 'accepted',
        ...(o.outcome.messageId ? { messageId: o.outcome.messageId } : {}),
        ...(o.outcome.code ? { code: o.outcome.code } : {}),
      }));
      if (classified.every((o) => o.outcome.state === 'accepted')) {
        return { state: 'accepted', messageId: `capture-${outboundId}`, code: null, recipientResults };
      }
      if (classified.some((o) => o.outcome.state === 'accepted')) {
        return { state: 'outcome_unknown', messageId: null, code: 'PARTIAL_ACCEPTANCE', recipientResults };
      }
      const uncertain = classified.find((o) => o.outcome.state === 'outcome_unknown');
      const result = uncertain?.outcome ?? classified[0]?.outcome ?? { state: 'failed', messageId: null, code: 'NO_RECIPIENTS' } satisfies TransportOutcome;
      return { ...result, recipientResults };
    }
    return transportOutcome(await sendEmail({
      from: { email: content.fromAddress, name: content.fromName },
      to: [...content.recipients.to], cc: [...content.recipients.cc], bcc: [...content.recipients.bcc],
      replyTo: content.fromAddress, subject: content.subject,
      text: `${content.text}${content.signature ? `\n\n${content.signature}` : ''}`,
      html: content.html, attachments: [...attachments], idempotencyKey: outboundId,
    }));
  },
};
