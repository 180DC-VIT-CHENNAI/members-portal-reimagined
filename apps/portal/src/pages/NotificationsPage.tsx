import { useEffect, useState } from 'react';
import { NOTIFICATIONS_CHANGED } from '../components/NotificationLink.tsx';
import { MentionNotices } from '../components/messages/MentionNotices.tsx';
import { Button, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate, relativeTime } from '../lib/format.ts';
import { Link, navigate } from '../lib/router.tsx';

type Page = Awaited<ReturnType<typeof loadPage>>;
type Notice = Page['notifications'][number];

const loadPage = (unread: boolean, before?: number) =>
  api('/api/notifications', { query: { ...(unread ? { unread: '1' as const } : {}), ...(before ? { before: String(before) } : {}) } });

const utcDay = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

function describe(notice: Notice): string {
  const who = notice.actorName ?? 'Someone';
  switch (notice.kind) {
    case 'task_assigned': return `${who} assigned you "${notice.taskTitle}"`;
    case 'task_comment': return `${who} commented on "${notice.taskTitle}"`;
    case 'task_due': {
      const when = notice.dueDate === utcDay(0) ? 'today' : notice.dueDate === utcDay(1) ? 'tomorrow' : `on ${formatDate(notice.dueDate)}`;
      return `"${notice.taskTitle}" is due ${when}`;
    }
    default: {
      const unhandled: never = notice.kind;
      throw new Error(`Unhandled notification kind: ${String(unhandled)}`);
    }
  }
}

/** Task notices for the signed-in person, newest first. */
export function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const first = useLoad(() => loadPage(unreadOnly), [unreadOnly]);
  const [older, setOlder] = useState<Page>({ notifications: [], nextBefore: null });
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  useEffect(() => setOlder({ notifications: [], nextBefore: null }), [first.data]);

  const items = [...(first.data?.notifications ?? []), ...older.notifications];
  const nextBefore = older.notifications.length ? older.nextBefore : first.data?.nextBefore;

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setProblem(null);
    try {
      await run();
      return true;
    } catch (err) {
      setProblem(problemFrom(err));
      return false;
    } finally {
      setBusy(null);
    }
  };
  const markRead = (body: { ids: number[] } | { upTo: number }) =>
    api('/api/notifications/read', { method: 'POST', body }).then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)));

  const open = async (notice: Notice) => {
    if (notice.readAt || (await act(`open-${notice.id}`, () => markRead({ ids: [notice.id] })))) navigate(`/projects/${notice.projectId}`);
  };
  const markAll = async () => {
    const newest = items[0];
    if (newest && (await act('all', () => markRead({ upTo: newest.id })))) first.reload();
  };
  const more = () =>
    nextBefore &&
    act('more', async () => {
      const page = await loadPage(unreadOnly, nextBefore);
      setOlder((prev) => ({ notifications: [...prev.notifications, ...page.notifications], nextBefore: page.nextBefore }));
    });

  return (
    <div className="page page-narrow">
      <PageHeader
        overline="Inbox"
        title="Notifications"
        lede="Message mentions, task assignments, comments and approaching deadlines."
        actions={
          <div className="cluster">
            <Link className="btn btn-ghost btn-sm" to="/notifications/preferences">Preferences</Link>
            <Button size="sm" variant={unreadOnly ? 'primary' : 'secondary'} onClick={() => setUnreadOnly((value) => !value)} aria-pressed={unreadOnly}>
              Unread only
            </Button>
            <Button size="sm" icon="check" busy={busy === 'all'} disabled={!items.some((item) => !item.readAt)} onClick={markAll}>
              Mark tasks read
            </Button>
          </div>
        }
      />
      <ProblemAlert problem={problem} />
      <MentionNotices unreadOnly={unreadOnly} />
      <h2>Task notices</h2>
      {first.problem ? (
        <ErrorState problem={first.problem} onRetry={first.reload} />
      ) : !first.data ? (
        <LoadingBlock />
      ) : items.length === 0 ? (
        <EmptyState icon="inbox" title={unreadOnly ? 'No unread task notices' : 'No task notices yet'}>
          <Link to="/projects">Go to your projects</Link>
        </EmptyState>
      ) : (
        <ul className="stack">
          {items.map((notice) => (
            <li key={notice.id} className="stack-sm">
              <a
                href={`/projects/${notice.projectId}`}
                aria-busy={busy === `open-${notice.id}`}
                onClick={(event) => {
                  if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                  event.preventDefault();
                  open(notice);
                }}
              >
                {notice.readAt ? describe(notice) : <strong>{describe(notice)}</strong>}
              </a>
              <span className="caption muted">
                {notice.projectName} · {relativeTime(notice.createdAt)}
                {!notice.readAt && ' · Unread'}
              </span>
            </li>
          ))}
        </ul>
      )}
      {nextBefore ? (
        <Button busy={busy === 'more'} onClick={more}>
          Load older
        </Button>
      ) : null}
    </div>
  );
}
