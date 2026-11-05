import { useState } from 'react';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { relativeTime } from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import { NOTIFICATIONS_CHANGED } from './NotificationLink.tsx';
import { Button, Card, ErrorState, LoadingBlock, ProblemAlert } from './ui.tsx';

const loadPage = (unreadOnly: boolean, before?: number) =>
  api('/api/notifications/mail', { query: { ...(unreadOnly ? { unread: '1' as const } : {}), ...(before ? { before: String(before) } : {}) } });
type Notice = Awaited<ReturnType<typeof loadPage>>['notices'][number];
const labels = { mail_reply: 'Incoming mail', mail_assigned: 'Conversation assigned to you', mail_review: 'Email awaiting your review' } as const;

export function MailNotices({ unreadOnly }: { readonly unreadOnly: boolean }) {
  const first = useLoad(() => loadPage(unreadOnly), [unreadOnly]);
  const [older, setOlder] = useState<Notice[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>();
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const items = [...(first.data?.notices ?? []), ...older];
  const next = cursor === undefined ? first.data?.nextBefore : cursor;
  const act = async (run: () => Promise<unknown>) => {
    setBusy(true); setProblem(null);
    try { await run(); } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <Card title="Shared mailbox notices" actions={<Button size="sm" onClick={() => {
    setOlder([]); setCursor(undefined); first.reload();
  }}>Refresh</Button>}>
    <ProblemAlert problem={problem} />
    {first.problem ? <ErrorState problem={first.problem} onRetry={first.reload} /> : !first.data ? <LoadingBlock rows={2} /> :
      items.length === 0 ? <p className="muted">No {unreadOnly ? 'unread ' : ''}mail notices.</p> :
        <ul className="stack">{items.map((notice) => <li key={notice.id} className="stack-sm">
          <Link to={notice.draftId ? `/mailboxes/${notice.mailboxId}/drafts/${notice.draftId}` : `/mailboxes/${notice.mailboxId}/conversations/${notice.conversationId}`}>
            {notice.readAt ? labels[notice.kind] : <strong>{labels[notice.kind]}</strong>}
          </Link>
          <span className="caption muted">{notice.mailboxName} · {relativeTime(notice.createdAt)}</span>
          {!notice.readAt && <Button size="sm" busy={busy} onClick={() => act(async () => {
            await api('/api/notifications/mail/read', { method: 'POST', body: { ids: [notice.id] } });
            setOlder([]); setCursor(undefined); first.reload();
            window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
          })}>Mark read</Button>}
        </li>)}</ul>}
    {next && <Button size="sm" busy={busy} onClick={() => act(async () => {
      const page = await loadPage(unreadOnly, next);
      setOlder((previous) => [...previous, ...page.notices]); setCursor(page.nextBefore);
    })}>Older mail notices</Button>}
  </Card>;
}
