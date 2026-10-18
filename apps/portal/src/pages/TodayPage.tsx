import { useEffect, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert } from '../components/ui.tsx';
import { OnboardingChecklist } from '../components/OnboardingChecklist.tsx';
import { Icon } from '../components/icons.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate, formatDateTime, plural, today } from '../lib/format.ts';
import { Link } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';

/** Home: work assigned to you, the next seven days of meets, and the latest news. */
export function TodayPage() {
  const { me, can } = useSession();
  const feed = useLoad(() => api('/api/today'), []);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  useEffect(() => {
    const visible = () => { if (document.visibilityState === 'visible') feed.reload(); };
    document.addEventListener('visibilitychange', visible);
    return () => document.removeEventListener('visibilitychange', visible);
  }, [feed.reload]);

  const complete = async (projectId: string, taskId: string) => {
    setBusy(taskId);
    setProblem(null);
    try {
      await api('/api/projects/:id/tasks/:taskId/status', { method: 'PUT', params: { id: projectId, taskId }, body: { status: 'completed' } });
      feed.reload();
    } catch (err) { setProblem(problemFrom(err)); }
    finally { setBusy(null); }
  };

  if (feed.problem) return <ErrorState title="Couldn't refresh Today" problem={feed.problem} onRetry={feed.reload} />;
  const data = feed.data;
  if (!data) return <LoadingBlock />;
  const day = today();
  const invited = data.attention.invited ?? 0;
  const failed = data.attention.failedEmails ?? 0;
  return (
    <div className="page page-narrow">
      <PageHeader overline={me.fullName} title="Today" lede="Your open work and the week ahead."
        actions={<Button icon="history" busy={feed.loading} onClick={feed.reload}>Refresh</Button>} />
      <div className="stack">
        <OnboardingChecklist />
        <p className="caption muted">Updated <time dateTime={data.generatedAt}>{formatDateTime(data.generatedAt)}</time></p>
        <ProblemAlert problem={problem} />
        {(invited > 0 || failed > 0) && (
          <Card title="Needs attention">
            <ul className="stack-sm activity-list">
              {invited > 0 && <li><Link to={can('people.view') ? '/people' : '/admin/invite'}>{plural(invited, 'person', 'people')} awaiting first sign-in</Link></li>}
              {failed > 0 && <li><Link to="/admin/email-queue">{plural(failed, 'email campaign')} failed</Link></li>}
            </ul>
          </Card>
        )}
        <Card title="Your tasks" description="Open tasks on active projects you can see, ordered by due date and priority.">
          {data.tasks.length === 0 ? <EmptyState icon="checkCircle" title="No open tasks assigned to you"><Link to="/projects">Browse your projects</Link></EmptyState> : (
            <ul className="stack">
              {data.tasks.map((task) => (
                <li key={task.id} className="task">
                  <label className="task-toggle">
                    <input type="checkbox" checked={false} disabled={busy === task.id || feed.loading} aria-label={`Mark "${task.title}" done`}
                      onChange={() => complete(task.projectId, task.id)} />
                  </label>
                  <div className="stack-sm">
                    <strong>{task.title}</strong>
                    <Link className="caption muted" to={`/projects/${task.projectId}`}>{task.projectName}</Link>
                    <div className="cluster">
                      {task.dueDate && <span className={task.dueDate < day ? 'badge badge-error' : 'badge'}>
                        {task.dueDate < day ? 'Overdue · ' : task.dueDate === day ? 'Today · ' : 'Due '}{formatDate(task.dueDate)}
                      </span>}
                      {task.priority !== 'normal' && <span className={task.priority === 'urgent' ? 'badge badge-warning' : 'badge'}>
                        {task.priority[0].toUpperCase() + task.priority.slice(1)} priority
                      </span>}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {data.hasMoreTasks && <p className="caption muted">Showing the first 100 tasks. <Link to="/projects">Open Projects for more</Link>.</p>}
        </Card>
        <Card title="Meets this week" description="The next seven days, including your department's meets.">
          {data.meets.length === 0 ? <EmptyState icon="calendar" title="No meets in the next seven days" /> : (
            <ul className="stack">
              {data.meets.map((meet) => (
                <li key={meet.id} className="row-between">
                  <div className="stack-sm">
                    <strong>{meet.title}</strong>
                    <p className="caption muted"><time dateTime={meet.scheduledAt}>{formatDateTime(meet.scheduledAt)}</time></p>
                    {meet.departments.length > 0 && <p className="caption muted">{meet.departments.map((d) => d.name).join(', ')}</p>}
                  </div>
                  {meet.meetLink && /^https?:\/\//i.test(meet.meetLink) && <a className="btn btn-secondary btn-sm" href={meet.meetLink} target="_blank" rel="noopener noreferrer">
                    <Icon name="externalLink" size={16} />Join
                  </a>}
                </li>
              ))}
            </ul>
          )}
          {data.hasMoreMeets && <p className="caption muted">Showing the first 20 meets.</p>}
          <div className="form-actions"><Link to="/meets" className="text-link">All meets</Link></div>
        </Card>
        <Card title="Latest announcements">
          {data.announcements.length === 0 ? <EmptyState icon="megaphone" title="No announcements yet" /> : (
            <ul className="stack">
              {data.announcements.map((announcement) => (
                <li key={announcement.id} className="stack-sm">
                  <Link to="/announcements">{announcement.title}</Link>
                  <time className="caption muted" dateTime={announcement.createdAt}>{formatDateTime(announcement.createdAt)}</time>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
