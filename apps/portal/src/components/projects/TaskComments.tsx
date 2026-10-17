import { type FormEvent, useState } from 'react';
import { Button, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, ProblemAlert, TextAreaField } from '../ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { formatDateTime } from '../../lib/format.ts';

const loadComments = (params: { id: string; taskId: string }, before?: number) =>
  api('/api/projects/:id/tasks/:taskId/comments', { params, query: before ? { before: String(before) } : {} });
type Comment = Awaited<ReturnType<typeof loadComments>>['comments'][number];

/** Plain-text comments, 50 to a page. A failed request keeps its draft and request id for a safe retry. */
export function TaskComments({ projectId, taskId, onChange }: {
  readonly projectId: string;
  readonly taskId: string;
  readonly onChange: () => void;
}) {
  const params = { id: projectId, taskId };
  const [cursors, setCursors] = useState<readonly (number | undefined)[]>([undefined]);
  const before = cursors.at(-1);
  const feed = useLoad(() => loadComments(params, before), [projectId, taskId, before]);
  const [body, setBody] = useState('');
  const [requestId, setRequestId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [removing, setRemoving] = useState<Comment | null>(null);
  const latest = () => { setCursors([undefined]); feed.reload(); };
  const failed = (err: unknown) => {
    const next = problemFrom(err);
    setProblem(next);
    if (next.status === 401 || next.status === 403 || next.status === 404) { feed.reload(); onChange(); }
  };
  const post = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/projects/:id/tasks/:taskId/comments', { method: 'POST', params, body: { body, requestId } });
      setBody('');
      setRequestId(crypto.randomUUID());
      latest();
      onChange();
    } catch (err) { failed(err); }
    finally { setBusy(false); }
  };
  const remove = async () => {
    if (!removing) return;
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/projects/:id/tasks/:taskId/comments/:commentId', { method: 'DELETE', params: { ...params, commentId: String(removing.id) } });
      setRemoving(null);
      feed.reload();
      onChange();
    } catch (err) { failed(err); }
    finally { setBusy(false); }
  };

  if (feed.problem) return <ErrorState problem={feed.problem} onRetry={feed.reload} />;
  return (
    <div className="stack">
      <form className="form" onSubmit={post}>
        <TextAreaField label="Comment" hint="Plain text. Everyone who can see the project can read it." rows={3} required maxLength={4000}
          value={body} error={problem?.fields.body} onChange={(e) => { setBody(e.target.value); setRequestId(crypto.randomUUID()); }} />
        <ProblemAlert problem={removing ? null : problem} fieldsShown={['body']} />
        <div className="form-actions">
          <Button type="submit" variant="primary" size="sm" busy={busy} disabled={!body.trim() || feed.loading}>Post comment</Button>
          <Button size="sm" onClick={latest} disabled={feed.loading}>Refresh</Button>
        </div>
      </form>
      {feed.loading || !feed.data ? <LoadingBlock rows={2} /> : (
        <>
          {feed.data.comments.length === 0 ? <EmptyState icon="history" title="No comments yet">Start the conversation about this task.</EmptyState> : (
            <ol className="stack activity-list">
              {feed.data.comments.map((comment) => (
                <li key={comment.id} className="stack-sm">
                  <div className="row-between">
                    <p className="caption"><strong>{comment.authorName}</strong> · <time dateTime={comment.createdAt}>{formatDateTime(comment.createdAt)}</time></p>
                    {comment.canRemove && <Button size="sm" variant="danger-quiet" disabled={busy} onClick={() => { setProblem(null); setRemoving(comment); }}>Remove</Button>}
                  </div>
                  {comment.removed ? <p className="caption muted">Comment removed.</p> : <p className="pre-wrap">{comment.body}</p>}
                </li>
              ))}
            </ol>
          )}
          <div className="cluster">
            {cursors.length > 1 && <Button size="sm" onClick={() => setCursors(cursors.slice(0, -1))}>Newer</Button>}
            {feed.data.nextBefore !== null && <Button size="sm" onClick={() => setCursors([...cursors, feed.data?.nextBefore ?? undefined])}>Older</Button>}
          </div>
        </>
      )}
      <ConfirmDialog open={removing !== null} title="Remove this comment?" confirmLabel="Remove comment" tone="danger" busy={busy} problem={removing ? problem : null}
        onConfirm={remove} onClose={() => { setRemoving(null); setProblem(null); }}>
        <p>Its text is erased for everyone. A removed marker stays in the conversation.</p>
      </ConfirmDialog>
    </div>
  );
}
