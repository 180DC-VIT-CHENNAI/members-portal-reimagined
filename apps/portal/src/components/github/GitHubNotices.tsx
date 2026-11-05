import { useEffect, useState } from 'react';
import { useLoad } from '../../lib/api.ts';
import { relativeTime } from '../../lib/format.ts';
import { github } from '../../lib/github-client.ts';
import { issuePath, noticeText } from '../../lib/github-view.ts';
import { navigate } from '../../lib/router.tsx';
import type { GitHubNoticeView, MarkNoticesReadInput } from '../../server/github/types.ts';
import { NOTIFICATIONS_CHANGED } from '../NotificationLink.tsx';
import { Button, Card, ErrorState, ProblemAlert } from '../ui.tsx';
import { useAction } from './use-action.ts';

const PAGE = 20;

export function GitHubNotices({ unreadOnly }: { readonly unreadOnly: boolean }) {
  const first = useLoad(() => github.notices(), []);
  const [older, setOlder] = useState<GitHubNoticeView[]>([]);
  const [olderHasMore, setOlderHasMore] = useState<boolean | null>(null);
  const act = useAction();

  useEffect(() => {
    setOlder([]);
    setOlderHasMore(null);
  }, [first.data]);

  if (!first.data) {
    if (!first.problem || first.problem.status === 403 || first.problem.status === 404) return null;
    return (
      <Card title="GitHub notices">
        <ErrorState problem={first.problem} onRetry={first.reload} />
      </Card>
    );
  }

  const all = [...first.data.notices, ...older];
  const items = unreadOnly ? all.filter((notice) => !notice.readAt) : all;
  const last = all[all.length - 1];
  const hasMore = olderHasMore ?? first.data.notices.length >= PAGE;
  if (items.length === 0) return null;

  const markRead = (input: MarkNoticesReadInput) => github.markNoticesRead(input).then(() => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED)));
  const open = async (notice: GitHubNoticeView) => {
    if (notice.readAt || (await act.run(`open:${notice.id}`, () => markRead({ ids: [notice.id] }))).ok) navigate(issuePath(notice.item.id));
  };
  const markAll = async () => {
    const newest = all[0];
    if (newest && (await act.run('all', () => markRead({ upTo: newest.id }))).ok) first.reload();
  };
  const loadOlder = async () => {
    if (!last) return;
    const result = await act.run('older', () => github.notices(last.id));
    if (!result.ok) return;
    setOlder((previous) => [...previous, ...result.value.notices]);
    setOlderHasMore(result.value.notices.length >= PAGE);
  };

  return (
    <Card
      title="GitHub notices"
      actions={
        <Button size="sm" icon="check" busy={act.busy === 'all'} disabled={!items.some((notice) => !notice.readAt)} onClick={() => void markAll()}>
          Mark GitHub notices read
        </Button>
      }
    >
      <ProblemAlert problem={act.problem} />
      <ul className="stack">
        {items.map((notice) => (
          <li key={notice.id} className="stack-sm">
            <a
              href={issuePath(notice.item.id)}
              aria-busy={act.busy === `open:${notice.id}`}
              onClick={(event) => {
                if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
                event.preventDefault();
                void open(notice);
              }}
            >
              {notice.readAt ? noticeText(notice) : <strong>{noticeText(notice)}</strong>}
            </a>
            <span className="caption muted">
              {notice.project.name} · {relativeTime(notice.createdAt)}
              {!notice.readAt && ' · Unread'}
            </span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button size="sm" busy={act.busy === 'older'} onClick={() => void loadOlder()}>
          Older GitHub notices
        </Button>
      )}
    </Card>
  );
}
