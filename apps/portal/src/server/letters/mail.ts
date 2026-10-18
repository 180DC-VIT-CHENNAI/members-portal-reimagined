import type { LetterType } from '../../lib/letter-kinds';
import { LETTER_LABELS } from '../../lib/letter-kinds';
import { escapeHtml } from '../html';

/** Subject/body come from the saved snapshot, never independent mutable send-form metadata. */
export function letterMail(type: LetterType, snapshot: Readonly<Record<string, string>>, docnum: string) {
  const name = snapshot.name || snapshot.announcementSender || snapshot.reportDirector || snapshot.ldiSubmitter || 'Colleague';
  const title = LETTER_LABELS[type];
  return {
    subject: `180DC VIT Chennai - ${title} (${docnum})`,
    html: `<h2>${escapeHtml(title)}</h2><p>Dear ${escapeHtml(name)},</p><p>Please find your ${escapeHtml(title.toLowerCase())} attached as a PDF.</p><p>Reference: ${escapeHtml(docnum)}</p><p>180 Degrees Consulting<br>VIT Chennai</p>`,
  };
}
