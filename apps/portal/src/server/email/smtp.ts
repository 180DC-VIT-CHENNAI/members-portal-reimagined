import { connect } from 'cloudflare:sockets';
import type { EmailMessage } from './mime.ts';
import { smtpSession, SmtpError } from './smtp-session.ts';

export async function smtpSend(user: string, password: string, message: EmailMessage) {
  const socket = connect(
    { hostname: 'mail.spacemail.com', port: 465 },
    { secureTransport: 'on', allowHalfOpen: false },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => {
      reject(new SmtpError('SMTP timeout'));
      void socket.close().catch(() => { /* The session reports the timeout. */ });
    }, 20_000);
  });
  try {
    return await Promise.race([
      smtpSession(socket.readable, socket.writable, user, password, message),
      timeout,
    ]);
  } catch (error) {
    if (error instanceof SmtpError) throw error;
    if (error instanceof Error) throw new SmtpError('SMTP connection failed');
    throw error;
  } finally {
    clearTimeout(timer);
    // A failed connect can make close() hang: never extend the session deadline waiting for it.
    void socket.close().catch(() => { /* The send result owns connection errors. */ });
  }
}
