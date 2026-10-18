import { useState } from 'react';
import { Button, EmptyState, ErrorState, LoadingBlock } from '../ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { formatDate, formatDateTime } from '../../lib/format.ts';
import { PRIORITY_LABEL } from './TaskForms.tsx';

const loadHistory = (params: { id: string; taskId: string }, before?: number) =>
  api('/api/projects/:id/tasks/:taskId/history', { params, query: before ? { before: String(before) } : {} });
type Event = Awaited<ReturnType<typeof loadHistory>>['events'][number];

function summary(event: Event): string {
  switch (event.action) {
    case 'task.create': return 'created the task';
    case 'task.update': return 'edited the task';
    case 'task.status':
      if (event.to.status === 'completed') return `marked it done${event.bulk ? ' with all open tasks' : ''}`;
      if (event.to.status === 'blocked') return event.from.status === 'blocked' ? 'changed why it is blocked' : 'marked it blocked';
      return event.from.status === 'blocked' ? 'unblocked it' : 'reopened it';
    case 'task.comment': return 'added a comment';
    case 'task.comment.remove': return 'removed a comment';
    default: return 'updated the task';
  }
}

function facts(event: Event): string[] {
  const to = event.to;
  const values: string[] = [];
  if (to.title !== undefined) values.push(`Title: ${to.title}`);
  if (to.assigneeName !== undefined) values.push(`Assignee: ${to.assigneeName ?? 'Unassigned'}`);
  if (to.dueDate !== undefined) values.push(to.dueDate ? `Due ${formatDate(to.dueDate)}` : 'No due date');
  if (to.priority !== undefined) values.push(`Priority: ${PRIORITY_LABEL[to.priority]}`);
  if (to.descriptionChanged) values.push('Details changed');
  return values;
}

/** Allow-listed audit events; refresh clears private entries when access has ended. */
export function TaskHistory({ projectId, taskId }: { readonly projectId: string; readonly taskId: string }) {
  const [cursors, setCursors] = useState<readonly (number | undefined)[]>([undefined]);
  const before = cursors.at(-1);
  const feed = useLoad(() => loadHistory({ id: projectId, taskId }, before), [projectId, taskId, before]);
  if (feed.problem) return <ErrorState problem={feed.problem} onRetry={feed.reload} />;
  return (
    <div className="stack">
      <div className="cluster"><Button size="sm" disabled={feed.loading} onClick={() => { setCursors([undefined]); feed.reload(); }}>Refresh history</Button></div>
      {feed.loading || !feed.data ? <LoadingBlock rows={3} /> : (
        <>
          {feed.data.events.length === 0 ? <EmptyState icon="history" title="No history yet" /> : (
            <ol className="stack activity-list">
              {feed.data.events.map((event) => (
                <li key={event.id} className="stack-sm">
                  <p><strong>{event.actorName}</strong> {summary(event)}.</p>
                  {facts(event).length > 0 && <p className="caption muted">{facts(event).join(' · ')}</p>}
                  <time className="caption muted" dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
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
    </div>
  );
}
