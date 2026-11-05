import PostalMime, { type Address } from 'postal-mime';
import { MAX_BODY_CHARS, MAX_PARSE_BYTES, type MailIdentity } from './inbox-types.ts';
import { attachmentAllowed, messageIds, normalizedAddress, safeFilename, safeLine } from './inbound-rules.ts';

function identities(values: readonly Address[] = []): MailIdentity[] {
  return values.flatMap((a) => a.group ? identities(a.group) : a.address ? [{
    address: normalizedAddress(a.address) ?? '', name: safeLine(a.name, 120),
  }] : []).filter((a) => a.address).slice(0, 100);
}

export async function parseInbound(input: { readonly raw: ArrayBuffer; readonly from: string; readonly to: string }) {
  const fallback = {
    from: { address: normalizedAddress(input.from) ?? '', name: '' },
    to: [{ address: normalizedAddress(input.to) ?? '', name: '' }], cc: [], replyTo: [],
    subject: '(Unparsed message)', text: '', html: '', rfcMessageId: null, inReplyTo: null,
    references: [], authSignals: '', attachments: [], quarantineReason: 'unparseable',
  };
  if (input.raw.byteLength > MAX_PARSE_BYTES) return { ...fallback, quarantineReason: 'oversized' };
  try {
    const parsed = await PostalMime.parse(input.raw, {
      maxNestingDepth: 20, maxPartCount: 100, maxHeadersSize: 131_072,
      maxRfc822NestingDepth: 0, forceRfc822Attachments: true, attachmentEncoding: 'arraybuffer',
    });
    const headers = (key: string) => parsed.headers.filter((h) => h.key === key);
    const id = headers('message-id');
    const rfcMessageId = id.length === 1 ? messageIds(id[0].value)[0] ?? null : null;
    const attachments = parsed.attachments.slice(0, 50).map((a) => ({
      filename: safeFilename(a.filename), mime: safeLine(a.mimeType, 120), contentId: safeLine(a.contentId ?? '', 255),
      inline: a.related === true || a.disposition === 'inline',
      bytes: typeof a.content === 'string' ? new TextEncoder().encode(a.content).buffer : new Uint8Array(a.content).buffer,
      allowed: attachmentAllowed(safeFilename(a.filename), a.mimeType),
    }));
    const from = identities(parsed.from ? [parsed.from] : [])[0] ?? fallback.from;
    const text = parsed.text ?? (parsed.html ?? '').replace(/<[^>]*>/g, ' ');
    return {
      from, to: identities(parsed.to), cc: identities(parsed.cc), replyTo: identities(parsed.replyTo),
      subject: safeLine(parsed.subject ?? '(No subject)'), text: text.slice(0, MAX_BODY_CHARS),
      html: (parsed.html ?? '').slice(0, 500_000), rfcMessageId,
      inReplyTo: messageIds(parsed.inReplyTo ?? '').at(-1) ?? null,
      references: messageIds(parsed.references ?? ''),
      authSignals: parsed.headers.filter((h) => ['authentication-results', 'arc-authentication-results', 'received-spf'].includes(h.key))
        .map((h) => `${h.key}: ${safeLine(h.value, 2000)}`).join('\n').slice(0, 6000),
      attachments,
      quarantineReason: parsed.attachments.length > 50 ? 'too_many_attachments'
        : attachments.some((a) => !a.allowed) ? 'dangerous_attachment'
        : !parsed.headers.length || !from.address ? 'unparseable' : null,
    };
  } catch (error) {
    // MIME is an untrusted boundary. Parser failures are retained for manager recovery.
    if (!(error instanceof Error)) throw error;
    return fallback;
  }
}
export type ParsedInbound = Awaited<ReturnType<typeof parseInbound>>;
