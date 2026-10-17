import { escapeHtml } from '../html.ts';

export const UNSUBSCRIBE_MARKER = '%%UNSUBSCRIBE_URL%%';
export function unsubscribeUrl(origin: string, token: string): string {
  return `${origin}/unsubscribe/${encodeURIComponent(token)}`;
}
export function unsubscribeHeaders(origin: string, token: string): Record<string, string> {
  return {
    'List-Unsubscribe': `<${origin}/api/newsletter/unsubscribe/${encodeURIComponent(token)}>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  };
}

/** A simple table layout that works in mail clients; no remote font, script or tracking pixel. */
export function newsletterFrame(title: string, content: string, unsubscribe?: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head>
<body style="margin:0;background:#f4f9e8;color:#171717;font-family:Arial,sans-serif"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="600" style="width:100%;max-width:600px;background:#fff;border-radius:16px" cellspacing="0" cellpadding="0"><tr><td style="padding:32px"><p style="font-size:12px;letter-spacing:2px;color:#5a8a1f">180DC VIT CHENNAI / THE CATALYST</p><h1 style="font-size:28px;font-weight:400">${escapeHtml(title)}</h1><div style="font-size:16px;line-height:1.6">${content}</div>${unsubscribe ? `<hr style="border:0;border-top:1px solid #ececec;margin-top:32px"><p style="font-size:12px;color:#666">You're receiving this because you confirmed your subscription to The Catalyst. <a href="${escapeHtml(unsubscribe)}">Unsubscribe</a>.</p>` : ''}</td></tr></table></td></tr></table></body></html>`;
}
export function confirmHtml(link: string): string {
  return newsletterFrame('Confirm your subscription', `<p>Case studies, impact stories, events and opportunities from 180DC VIT Chennai.</p><p><a href="${escapeHtml(link)}">Confirm subscription</a></p><p>This link expires in 48 hours. If you didn't request it, you can ignore this email.</p>`);
}
export function welcomeHtml(origin: string, token: string, back: boolean): string {
  return newsletterFrame(back ? 'Welcome back to The Catalyst' : 'Welcome to The Catalyst', '<p>Your subscription is confirmed. Look out for our next issue.</p>', unsubscribeUrl(origin, token));
}
export function unsubscribeLinkHtml(origin: string, token: string): string {
  return newsletterFrame('Your unsubscribe link', `<p><a href="${escapeHtml(unsubscribeUrl(origin, token))}">Unsubscribe from The Catalyst</a></p><p>If you didn't request this, no action is needed: your subscription is unchanged.</p>`);
}
