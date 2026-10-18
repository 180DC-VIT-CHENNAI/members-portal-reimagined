import { useId, useState } from 'react';
import { InstanceActivity } from '../components/teams/InstanceActivity.tsx';
import { LevelBoard } from '../components/teams/LevelBoard.tsx';
import { OutsidePeople } from '../components/teams/OutsidePeople.tsx';
import { RosterView } from '../components/teams/RosterView.tsx';
import { StaffingBoard } from '../components/teams/StaffingBoard.tsx';
import { BackLink, Button, ConfirmDialog, ErrorState, LoadingBlock, PageHeader, ProblemAlert } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDate, plural } from '../lib/format.ts';
import { navigate } from '../lib/router.tsx';
import { type Instance, loadInstance, loadPlaceable, type Placeable } from '../lib/team-client.ts';

const VIEWS = [
  ['staffing', 'Staffing'],
  ['progression', 'Progression'],
  ['roster', 'Roster'],
  ['activity', 'Activity'],
] as const;
type View = (typeof VIEWS)[number][0];

/** One team instance: staffing, progression, the roster and recent activity, with the actions the caller may take. */
export function TeamInstancePage({ id }: { id: string }) {
  const instance = useLoad(() => loadInstance(id), [id]);
  const staff = Boolean(instance.data?.access.staff);
  const people = useLoad(() => (staff ? loadPlaceable(id) : Promise.resolve<Placeable[]>([])), [id, staff]);
  const [view, setView] = useState<View>('roster');
  const [deleting, setDeleting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const viewGroup = useId();

  if (instance.problem) return <ErrorState problem={instance.problem} onRetry={instance.reload} />;
  const current = instance.data;
  if (!current) return <LoadingBlock />;

  const remove = async () => {
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/team-instances/:id', { method: 'DELETE', params: { id } });
      navigate('/teams');
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  const facts = [current.departments.map((d) => d.name).join(', '), `Created ${formatDate(current.createdAt)}${current.createdByName ? ` by ${current.createdByName}` : ''}`];
  return (
    <div className="page">
      <BackLink to="/teams">Team instances</BackLink>
      <PageHeader
        overline="Team instance"
        title={current.name}
        actions={
          current.access.configure && (
            <div className="cluster">
              <Button icon="pencil" onClick={() => navigate(`/teams/${id}/edit`)}>
                Edit
              </Button>
              <Button
                variant="danger-quiet"
                icon="trash"
                onClick={() => {
                  setProblem(null);
                  setDeleting(true);
                }}
              >
                Delete
              </Button>
            </div>
          )
        }
      />
      <div className="stack">
        <div className="cluster">
          <span className="badge">{plural(current.stats.teams, 'team')}</span>
          <span className="badge">{plural(current.stats.people, 'person', 'people')}</span>
          {current.stats.short > 0 && <span className="badge badge-warning">{plural(current.stats.short, 'team')} short</span>}
          <span className="caption muted">{facts.filter(Boolean).join(' · ')}</span>
        </div>
        {current.description && <p className="pre-wrap">{current.description}</p>}
        <div className="segmented" role="radiogroup" aria-label="View">
          {VIEWS.map(([value, label]) => (
            <label key={value}>
              <input type="radio" name={viewGroup} value={value} checked={view === value} onChange={() => setView(value)} />
              <span>{label}</span>
            </label>
          ))}
        </div>
        <ViewPanel view={view} instance={current} people={people.data ?? []} peopleProblem={people.problem ?? null} onChange={instance.reload} />
      </div>
      <ConfirmDialog
        open={deleting}
        title={`Delete "${current.name}"?`}
        confirmLabel="Delete instance"
        tone="danger"
        busy={busy}
        problem={deleting ? problem : null}
        onConfirm={remove}
        onClose={() => setDeleting(false)}
      >
        <p>Its teams, groups, outside people and everyone's places are deleted. The audit log keeps its history.</p>
      </ConfirmDialog>
    </div>
  );
}

function ViewPanel({
  view,
  instance,
  people,
  peopleProblem,
  onChange,
}: {
  view: View;
  instance: Instance;
  people: readonly Placeable[];
  peopleProblem: ApiProblem | null;
  onChange: () => void;
}) {
  switch (view) {
    case 'staffing':
      return (
        <div className="stack">
          <ProblemAlert problem={peopleProblem} />
          <StaffingBoard instance={instance} people={people} onChange={onChange} />
          <OutsidePeople instance={instance} onChange={onChange} />
        </div>
      );
    case 'progression':
      return <LevelBoard instance={instance} onChange={onChange} />;
    case 'roster':
      return <RosterView instance={instance} />;
    case 'activity':
      return <InstanceActivity instance={instance} />;
    default: {
      const unhandled: never = view;
      throw new Error(`Unhandled view: ${String(unhandled)}`);
    }
  }
}
