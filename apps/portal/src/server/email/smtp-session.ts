import { buildMimeMessage, utf8Base64, type EmailMessage } from './mime.ts';

export class SmtpError extends Error {
  readonly code: number | undefined;
  constructor(message: string, code?: number) {
    super(message);
    this.name = 'SmtpError';
    this.code = code;
  }
}

export type SmtpResult = {
  readonly accepted: readonly string[];
  readonly rejected: readonly string[];
  readonly error?: string;
};

/** Run one SMTP session over a connected TLS stream. The caller owns closing it. */
export async function smtpSession(
  readable: ReadableStream<Uint8Array>,
  writable: WritableStream<Uint8Array>,
  user: string,
  password: string,
  message: EmailMessage,
): Promise<SmtpResult> {
  const reader = readable.getReader();
  const writer = writable.getWriter();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buffer = '';
  async function line(): Promise<string> {
    for (;;) {
      const end = buffer.indexOf('\r\n');
      if (end !== -1) {
        const value = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        return value;
      }
      const chunk = await reader.read();
      if (chunk.done) throw new SmtpError('SMTP connection closed before reply');
      buffer += decoder.decode(chunk.value, { stream: true });
      if (buffer.length > 65536) throw new SmtpError('SMTP response exceeds limit');
    }
  }
  async function reply(): Promise<{ code: number; text: string }> {
    const lines: string[] = [];
    for (let count = 0; count < 100; count++) {
      const value = await line();
      const match = /^(\d{3})([ -])/.exec(value);
      if (!match) throw new SmtpError('Malformed SMTP reply');
      lines.push(value);
      if (match[2] === ' ') return { code: Number(match[1]), text: lines.join('\n') };
    }
    throw new SmtpError('SMTP multiline response exceeds limit');
  }
  async function command(value: string) {
    await writer.write(encoder.encode(value + '\r\n'));
    return reply();
  }
  async function expect(value: string, codes: readonly number[]) {
    const response = await command(value);
    if (!codes.includes(response.code)) {
      // Never include the command or raw server reply: authentication replies may contain secrets.
      throw new SmtpError(`SMTP ${value.split(' ')[0]} failed (${response.code})`, response.code);
    }
    return response;
  }
  try {
    const greeting = await reply();
    if (greeting.code !== 220) throw new SmtpError('SMTP greeting failed', greeting.code);
    const ehlo = await expect('EHLO 180dcvitc.org', [250]);
    if (/AUTH[^\n]*\bPLAIN\b/i.test(ehlo.text)) {
      await expect('AUTH PLAIN ' + utf8Base64('\0' + user + '\0' + password), [235]);
    } else if (/AUTH[^\n]*\bLOGIN\b/i.test(ehlo.text)) {
      await expect('AUTH LOGIN', [334]);
      // Do not route credentials through expect(), which names failed commands.
      for (const [value, code] of [[user, 334], [password, 235]] as const) {
        const response = await command(utf8Base64(value));
        if (response.code !== code) throw new SmtpError('SMTP authentication failed', response.code);
      }
    } else {
      throw new SmtpError('SMTP server has no supported authentication method');
    }
    const sender = /<([^>]+)>/.exec(message.from)?.[1] ?? message.from;
    if (/[\r\n<>]/.test(sender) || message.to.some((to) => /[\r\n<>]/.test(to))) {
      throw new SmtpError('Invalid SMTP envelope address');
    }
    await expect(`MAIL FROM:<${sender.trim()}>`, [250]);
    const accepted: string[] = [];
    const rejected: string[] = [];
    let error: string | undefined;
    for (const recipient of message.to) {
      const response = await command(`RCPT TO:<${recipient}>`);
      if (response.code === 250 || response.code === 251) accepted.push(recipient);
      else {
        rejected.push(recipient);
        error = `SMTP RCPT failed (${response.code})`;
      }
    }
    if (accepted.length) {
      await expect('DATA', [354]);
      const mime = buildMimeMessage({ ...message, to: accepted }).replace(/^\./gm, '..');
      await writer.write(encoder.encode(mime + '\r\n.\r\n'));
      const response = await reply();
      if (response.code !== 250) throw new SmtpError('SMTP DATA failed', response.code);
    }
    // Acceptance is definitive. The caller closes the connection without a QUIT
    // exchange so a disconnect after DATA cannot be mistaken for a failed send.
    return { accepted, rejected, error };
  } finally {
    reader.releaseLock();
    writer.releaseLock();
  }
}
