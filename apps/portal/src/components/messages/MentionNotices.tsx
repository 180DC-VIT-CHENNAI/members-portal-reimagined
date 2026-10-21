import { useEffect, useState } from 'react';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { relativeTime } from '../../lib/format.ts';
import { type Mention, POLL_MS } from '../../lib/message-client.ts';
import { navigate } from '../../lib/router.tsx';
import { NOTIFICATIONS_CHANGED } from '../NotificationLink.tsx';
import { Button, Card, ErrorState, LoadingBlock, ProblemAlert } from '../ui.tsx';
import '../../messaging.css';

export function MentionNotices({ unreadOnly }: { readonly unreadOnly: boolean }) {
  const load = (before?: number) =>
    api('/api/notifications/mentions', { query: { ...(before ? { before: String(before) } : {}), ...(unreadOnly ? { unread: '1' as const } : {}) } });
  const first = useLoad(() => load(), [unreadOnly]);
  const [older, setOlder] = useState<Mention[]>([]);
  const [cursor, setCursor] = useState<number | null | undefined>();
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setOlder([]);
    setCursor(undefined);
  }, [unreadOnly]);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') first.reload();
    }, POLL_MS.list);
    return () => window.clearInterval(timer);
  }, [first.reload]);
  const next = cursor === undefined ? first.data?.nextBefore : cursor;
  const items = [...(first.data?.mentions ?? []), ...older];
  const open = async (notice: Mention) => {
    setProblem(null);
    try {
      await api('/api/notifications/mentions/read', { method: 'POST', body: { ids: [notice.id] } });
      window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));
      navigate(`/messages/${notice.conversationId}`);
    } catch (err) {
      setProblem(problemFrom(err));
    }
  };
  const more = async () => {
    if (!next) return;
    setBusy(true);
    try {
      const page = await load(next);
      setOlder((prev) => [...prev, ...page.mentions]);
      setCursor(page.nextBefore);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Message mentions">
      <ProblemAlert problem={problem} />
      {first.problem ? <ErrorState problem={first.problem} onRetry={first.reload} /> : !first.data ? <LoadingBlock rows={2} /> : items.length === 0 ?
        <p className="muted">No {unreadOnly ? 'unread ' : ''}mentions.</p> :
        <ul className="stack">{items.map((notice) => (
          <li key={notice.id} className="stack-sm">
            <button className="mention-notice" type="button" onClick={() => open(notice)}>
              {notice.readAt ? `${notice.actorName ?? 'Someone'} mentioned you` : <strong>{notice.actorName ?? 'Someone'} mentioned you</strong>}
            </button>
            <span className="wrap-anywhere">{notice.preview}</span>
            <span className="caption muted">{notice.conversationTitle} · {relativeTime(notice.createdAt)}</span>
          </li>
        ))}</ul>
      }
      {next && <Button size="sm" busy={busy} onClick={more}>Older mentions</Button>}
    </Card>
  );
}
