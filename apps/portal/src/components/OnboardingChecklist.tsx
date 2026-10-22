import { useState } from 'react';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { Link } from '../lib/router.tsx';
import { Button, Card, ProblemAlert } from './ui.tsx';

type Acknowledgment = 'department_read' | 'resources_read' | 'checklist_dismissed' | `policy:${string}`;

const loadChecklist = () => api('/api/onboarding');

const GAP_LABELS = { year: 'year', branch: 'branch', about: 'a bio or skills' } as const;

/**
 * First-login checklist for the signed-in person. Renders nothing once every
 * item is done, after it is hidden, or while it loads; it never blocks the page.
 */
export function OnboardingChecklist() {
  const checklist = useLoad(loadChecklist, []);
  const [busy, setBusy] = useState<Acknowledgment | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const acknowledge = async (item: Acknowledgment) => {
    setBusy(item);
    setProblem(null);
    try {
      checklist.setData(await api('/api/onboarding/acknowledgments', { method: 'POST', body: { item } }));
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(null);
    }
  };

  const data = checklist.data;
  if (!data?.visible) return null;
  const done = data.items.filter((item) => item.done).length;
  return (
    <Card
      title="Get started"
      description={`${done} of ${data.items.length} done. Nothing here is required to use the portal.`}
      actions={<Button size="sm" variant="ghost" busy={busy === 'checklist_dismissed'} onClick={() => acknowledge('checklist_dismissed')}>Hide</Button>}
    >
      <ProblemAlert problem={problem} />
      <ul className="stack">
        {data.items.map((item) => (
          <li key={item.key} className="row-between">
            <div className="stack-sm">
              <strong>{item.done ? <span className="badge">Done</span> : null} {item.title}</strong>
              <p className="caption muted">{item.description}</p>
              {item.missing.length > 0 && (
                <p className="caption muted">Still missing: {item.missing.map((gap) => GAP_LABELS[gap]).join(', ')}.</p>
              )}
            </div>
            <div className="cluster">
              {item.href.startsWith('https://') ? (
                <a className="btn btn-secondary btn-sm" href={item.href} target="_blank" rel="noopener noreferrer">Open</a>
              ) : (
                <Link className="btn btn-secondary btn-sm" to={item.href}>{item.kind === 'derived' ? 'Edit profile' : 'Open'}</Link>
              )}
              {item.acknowledgment && !item.done && (
                <Button size="sm" busy={busy === item.acknowledgment} onClick={() => {
                  if (item.acknowledgment) void acknowledge(item.acknowledgment);
                }}>
                  {item.key.startsWith('policy:') ? 'I acknowledge' : 'Mark as read'}
                </Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
