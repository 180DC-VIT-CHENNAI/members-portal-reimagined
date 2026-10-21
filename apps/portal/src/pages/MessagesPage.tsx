import { type FormEvent, useEffect, useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SearchField } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { relativeTime } from '../lib/format.ts';
import { openChannel, POLL_MS } from '../lib/message-client.ts';
import { Link } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { plainText } from '../server/messaging-rules.ts';
import '../messaging.css';

type SearchResult = Awaited<ReturnType<typeof runSearch>>['results'][number];
const runSearch = (q: string) => api('/api/messages/search', { query: { q } });

const KIND_LABEL = { direct: 'Direct', department: 'Department', project: 'Project' } as const;

/** Conversations the signed-in person can read, newest activity first, with unread counts and search. */
export function MessagesPage() {
  const { me } = useSession();
  const list = useLoad(() => api('/api/messages/conversations'), []);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') list.reload();
    }, POLL_MS.list);
    return () => window.clearInterval(timer);
  }, [list.reload]);

  const act = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    setProblem(null);
    try {
      await run();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };
  const search = (event: FormEvent) => {
    event.preventDefault();
    const q = query.trim();
    if (q.length < 2) return setResults(null);
    void act('search', async () => setResults((await runSearch(q)).results));
  };

  return (
    <div className="page page-narrow">
      <PageHeader
        overline="Internal"
        title="Messages"
        lede="Direct messages and department and project channels. Only people who can see the department or project can read its channel."
        actions={
          <div className="cluster">
            {me.departmentId && (
              <Button size="sm" icon="users" busy={busy === 'channel'} onClick={() => act('channel', () => openChannel({ departmentId: me.departmentId ?? '' }))}>
                My department channel
              </Button>
            )}
            <Link to="/notifications/preferences" className="btn btn-ghost btn-sm">
              Notification settings
            </Link>
          </div>
        }
      />
      <ProblemAlert problem={problem} />
      <form className="cluster" onSubmit={search} role="search">
        <SearchField label="Search messages" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="At least 2 characters" />
        <Button type="submit" busy={busy === 'search'}>
          Search
        </Button>
        {results && (
          <Button variant="ghost" onClick={() => setResults(null)}>
            Clear
          </Button>
        )}
      </form>
      {results ? (
        results.length === 0 ? (
          <EmptyState title="No messages match" />
        ) : (
          <ul className="stack" aria-label="Search results">
            {results.map((result) => (
              <li key={result.id} className="stack-sm">
                <Link to={`/messages/${result.conversationId}`}>{result.title ?? 'Conversation'}</Link>
                <span className="wrap-anywhere">{result.snippet}</span>
                <span className="caption muted">
                  {result.authorName} · {relativeTime(result.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        )
      ) : list.problem ? (
        <ErrorState problem={list.problem} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingBlock />
      ) : list.data.conversations.length === 0 ? (
        <EmptyState icon="messageSquare" title="No conversations yet">
          Start one from someone's profile in the <Link to="/people">directory</Link>, or open a project's channel.
        </EmptyState>
      ) : (
        <ul className="conversation-list" aria-label="Conversations">
          {list.data.conversations.map((c) => (
            <li key={c.id}>
              <Link to={`/messages/${c.id}`} className="conversation-row">
                <span className="conversation-row-head">
                  {c.unread > 0 ? <strong>{c.title ?? 'Conversation'}</strong> : <span>{c.title ?? 'Conversation'}</span>}
                  <span className="badge">{KIND_LABEL[c.kind]}</span>
                  {c.muted && <span className="caption muted">Muted</span>}
                  {c.unread > 0 && (
                    <span className="badge badge-accent" aria-label={`${c.unreadCapped ? '99+' : c.unread} unread`}>
                      {c.unreadCapped ? '99+' : c.unread}
                    </span>
                  )}
                </span>
                <span className="caption muted wrap-anywhere">
                  {c.lastAt ? `${c.lastBody === null ? 'Message deleted' : plainText(c.lastBody).slice(0, 100)} · ${relativeTime(c.lastAt)}` : 'No messages yet'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
