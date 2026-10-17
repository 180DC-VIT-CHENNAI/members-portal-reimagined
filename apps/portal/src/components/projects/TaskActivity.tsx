import { useId, useState } from 'react';
import { Button } from '../ui.tsx';
import { plural } from '../../lib/format.ts';
import { TaskComments } from './TaskComments.tsx';
import { TaskHistory } from './TaskHistory.tsx';

/** Activity loads only when a reader opens the task's disclosure. */
export function TaskActivity({ projectId, taskId, count, onChange }: {
  readonly projectId: string;
  readonly taskId: string;
  readonly count: number;
  readonly onChange: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'comments' | 'history'>('comments');
  const panelId = useId();
  return (
    <div className="stack-sm">
      <div className="cluster">
        <Button size="sm" variant="ghost" icon="history" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen(!open)}>
          Activity{count > 0 ? ` · ${plural(count, 'comment')}` : ''}
        </Button>
      </div>
      {open && (
        <section id={panelId} className="stack task-activity" aria-label="Task activity">
          <div className="segmented" role="radiogroup" aria-label="Activity view">
            <label>
              <input type="radio" name={panelId} value="comments" checked={tab === 'comments'} onChange={() => setTab('comments')} />
              <span>Comments</span>
            </label>
            <label>
              <input type="radio" name={panelId} value="history" checked={tab === 'history'} onChange={() => setTab('history')} />
              <span>History</span>
            </label>
          </div>
          {tab === 'comments' ? <TaskComments projectId={projectId} taskId={taskId} onChange={onChange} /> : <TaskHistory projectId={projectId} taskId={taskId} />}
        </section>
      )}
    </div>
  );
}
