import type { mailDraftSnapshots } from '@schema';
import { statement } from './access';
import { messageIds } from './inbound-rules';
import type { TransportOutcome } from './transport';

/** Called in the same batch that finalizes the claim. Never turns acceptance into delivery. */
export function sentThreadStatements(input: {
  readonly snapshot: typeof mailDraftSnapshots.$inferSelect; readonly intentId: string;
  readonly claimToken: string; readonly outcome: TransportOutcome;
}) {
  const { snapshot: s, outcome } = input;
  if (!s.conversationId || outcome.state === 'failed') return [];
  const at = new Date().toISOString(), id = crypto.randomUUID();
  const providerId = outcome.recipientResults?.find((r) => r.accepted && r.messageId)?.messageId ?? outcome.messageId;
  const identity = (address: string) => ({ address, name: '' });
  const condition = `EXISTS(SELECT 1 FROM mail_send_intents WHERE id=? AND claim_token=? AND state=?)`;
  const values = [input.intentId, input.claimToken, outcome.state];
  return [
    statement(`INSERT OR IGNORE INTO mail_messages(id,mailbox_id,conversation_id,direction,status,rfc_message_id,
      provider_message_id,references_json,outbound_id,envelope_from,envelope_to,from_json,to_json,cc_json,reply_to_json,
      subject,text,raw_size,received_at)
      SELECT ?,?,?,'out',?,?,?,'[]',?,?,?,?,?,?,?,?,?,0,? WHERE ${condition}`,
    [id, s.mailboxId, s.conversationId, outcome.state, providerId ? messageIds(providerId)[0] ?? null : null,
      providerId, input.intentId, s.fromAddress, s.recipients.to.join(','),
      JSON.stringify({ address: s.fromAddress, name: s.fromName }), JSON.stringify(s.recipients.to.map(identity)),
      JSON.stringify(s.recipients.cc.map(identity)), JSON.stringify([identity(s.fromAddress)]),
      s.subject, s.text, at, ...values]),
    statement(`UPDATE mail_conversations SET last_message_at=? WHERE id=? AND mailbox_id=? AND ${condition}`,
      [at, s.conversationId, s.mailboxId, ...values]),
    statement(`INSERT OR IGNORE INTO mail_conversation_participants(conversation_id,mailbox_id,address)
      SELECT ?,?,value FROM json_each(?) WHERE ${condition}`,
    [s.conversationId, s.mailboxId, JSON.stringify([...s.recipients.to, ...s.recipients.cc]), ...values]),
  ];
}
