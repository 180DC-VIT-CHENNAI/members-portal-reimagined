export type EmailAttachment = {
  readonly filename: string;
  /** Base64-encoded attachment bytes. */
  readonly content: string;
  readonly contentType?: string;
};

export type EmailMessage = {
  readonly from: string;
  readonly to: readonly string[];
  readonly subject: string;
  readonly html: string;
  readonly attachments?: readonly EmailAttachment[];
  readonly extraHeaders?: Readonly<Record<string, string>>;
};

export function sanitizeHeader(value: string): string {
  return value.replace(/[\r\n]+/g, ' ').trim();
}

export function utf8Base64(value: string): string {
  let binary = '';
  for (const byte of new TextEncoder().encode(value)) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#(x[0-9a-f]+|\d+);/gi, (_match, encoded: string) => {
      const code = encoded.toLowerCase().startsWith('x')
        ? parseInt(encoded.slice(1), 16)
        : parseInt(encoded, 10);
      return code <= 0x10ffff ? String.fromCodePoint(code) : '';
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&apos;/gi, "'")
    .replace(/&amp;/gi, '&');
}

export function htmlToPlainText(html: string): string {
  return decodeEntities(
    html
      .replace(/<(style|script|head)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|h[1-6]|li|table)>/gi, '\n')
      .replace(/<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
        (_match, href: string, label: string) => `${label.replace(/<[^>]+>/g, '').trim()} (${href})`)
      .replace(/<[^>]+>/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter((line, index, all) => line !== '' || all[index - 1] !== '')
    .join('\n')
    .trim();
}

/** Encode bytes rather than code points, with physical lines no longer than 76 bytes. */
export function quotedPrintable(value: string): string {
  return value.replace(/\r\n/g, '\n').split('\n').map((line) => {
    let encoded = '';
    let length = 0;
    for (const byte of new TextEncoder().encode(line)) {
      // Encoding whitespace everywhere also protects trailing whitespace.
      const token = byte >= 33 && byte <= 126 && byte !== 61
        ? String.fromCharCode(byte)
        : '=' + byte.toString(16).toUpperCase().padStart(2, '0');
      if (length + token.length > 75) {
        encoded += '=\r\n';
        length = 0;
      }
      encoded += token;
      length += token.length;
    }
    return encoded;
  }).join('\r\n');
}

function subjectHeader(value: string): string {
  const clean = sanitizeHeader(value);
  if (/^[\x20-\x7e]*$/.test(clean)) return clean;
  // Fold encoded words at character boundaries; each word is below RFC 2047's 75-byte limit.
  const words: string[] = [];
  let chunk = '';
  for (const char of clean) {
    if (new TextEncoder().encode(chunk + char).length > 42) {
      words.push(`=?UTF-8?B?${utf8Base64(chunk)}?=`);
      chunk = '';
    }
    chunk += char;
  }
  if (chunk) words.push(`=?UTF-8?B?${utf8Base64(chunk)}?=`);
  return words.join('\r\n ');
}

function attachmentType(filename: string): string {
  switch (filename.split('.').pop()?.toLowerCase()) {
    case 'pdf': return 'application/pdf';
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    default: return 'application/octet-stream';
  }
}

export function buildMimeMessage(message: EmailMessage): string {
  const alt = '180dc-alt-' + crypto.randomUUID();
  const mixed = '180dc-mix-' + crypto.randomUUID();
  const headers = [
    'From: ' + sanitizeHeader(message.from),
    'To: ' + (message.to.length === 1 ? sanitizeHeader(message.to[0] ?? '') : 'undisclosed-recipients:;'),
    'Subject: ' + subjectHeader(message.subject),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + crypto.randomUUID() + '@180dcvitc.org>',
    'MIME-Version: 1.0',
  ];
  for (const [name, value] of Object.entries(message.extraHeaders ?? {})) {
    // Extras cannot replace MIME framing or recipient headers.
    if (!/^[A-Za-z0-9-]+$/.test(name) ||
        /^(from|to|cc|bcc|subject|date|message-id|mime-version|content-.*)$/i.test(name)) continue;
    headers.push(name + ': ' + sanitizeHeader(value));
  }
  const alternative = [
    `--${alt}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    quotedPrintable(htmlToPlainText(message.html)),
    `--${alt}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: quoted-printable',
    '',
    quotedPrintable(message.html),
    `--${alt}--`,
    '',
  ].join('\r\n');
  if (!message.attachments?.length) {
    headers.push(`Content-Type: multipart/alternative; boundary="${alt}"`);
    return headers.join('\r\n') + '\r\n\r\n' + alternative;
  }
  headers.push(`Content-Type: multipart/mixed; boundary="${mixed}"`);
  const parts = [
    `--${mixed}\r\nContent-Type: multipart/alternative; boundary="${alt}"\r\n\r\n${alternative}`,
  ];
  for (const attachment of message.attachments) {
    const filename = sanitizeHeader(attachment.filename).replace(/["\\]/g, '');
    const type = sanitizeHeader(attachment.contentType || attachmentType(filename));
    const base64 = attachment.content.replace(/\s+/g, '').match(/.{1,76}/g)?.join('\r\n') ?? '';
    parts.push([
      `--${mixed}`,
      `Content-Type: ${type}; name="${filename}"`,
      'Content-Transfer-Encoding: base64',
      `Content-Disposition: attachment; filename="${filename}"`,
      '',
      base64,
      '',
    ].join('\r\n'));
  }
  parts.push(`--${mixed}--\r\n`);
  return headers.join('\r\n') + '\r\n\r\n' + parts.join('');
}
