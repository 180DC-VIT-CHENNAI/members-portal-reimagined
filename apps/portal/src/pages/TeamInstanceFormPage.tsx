import { type FormEvent, useState } from 'react';
import { Alert, BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextAreaField, TextField } from '../components/ui.tsx';
import { api, lookups, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import { allTeams, type Instance, loadInstance } from '../lib/team-client.ts';

type Choice = { id: string; name: string };
const MAX_LEVELS = 20;

/** Create a team instance, or change the settings of the one with `id`. */
export function TeamInstanceFormPage({ id }: { id?: string }) {
  const { can } = useSession();
  const instance = useLoad(() => (id ? loadInstance(id) : Promise.resolve(null)), [id]);
  const departments = useLoad(() => lookups.departments(), []);

  const problem = instance.problem ?? departments.problem;
  if (problem) return <ErrorState problem={problem} onRetry={() => [instance, departments].forEach((load) => load.reload())} />;
  if (instance.data === undefined || !departments.data) return <LoadingBlock />;
  const existing = instance.data;
  const allowed = existing ? existing.access.configure : can('team_instances.manage');
  const choices = departments.data.filter((d) => (d.active || existing?.departments.some((x) => x.id === d.id)) && can('team_instances.manage', d.id));

  return (
    <div className="page page-narrow">
      <BackLink to={existing ? `/teams/${existing.id}` : '/teams'}>{existing ? existing.name : 'Team instances'}</BackLink>
      <PageHeader overline="Team instances" title={existing ? 'Edit instance' : 'New instance'} />
      {allowed ? (
        <InstanceForm key={existing?.id ?? 'new'} existing={existing} departments={choices} />
      ) : (
        <EmptyState icon="trophy" title={existing ? "You can't change this instance" : "You can't create team instances"} />
      )}
    </div>
  );
}

const sameSet = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x) => b.includes(x));

function InstanceForm({ existing, departments }: { existing: Instance | null; departments: Choice[] }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [groupLabel, setGroupLabel] = useState(existing?.groupLabel ?? 'Company');
  const [selected, setSelected] = useState<string[]>(
    existing ? existing.departments.map((d) => d.id) : departments.length === 1 ? departments.map((d) => d.id) : [],
  );
  const [levels, setLevels] = useState<string[]>(existing ? existing.levels.map((level) => level.name) : ['Level 1']);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const back = existing ? `/teams/${existing.id}` : '/teams';
  const stranded = existing ? allTeams(existing).filter((team) => team.currentLevel > levels.length).length : 0;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      if (existing) {
        // Send only what changed, so the activity names the right settings.
        const body: { name?: string; description?: string | null; groupLabel?: string; departmentIds?: string[]; levels?: string[] } = {};
        if (name !== existing.name) body.name = name;
        if ((description.trim() || null) !== existing.description) body.description = description.trim() || null;
        if (groupLabel !== existing.groupLabel) body.groupLabel = groupLabel;
        if (!sameSet(selected, existing.departments.map((d) => d.id))) body.departmentIds = selected;
        if (levels.join('\n') !== existing.levels.map((level) => level.name).join('\n')) body.levels = levels;
        if (Object.keys(body).length) await api('/api/team-instances/:id', { method: 'PATCH', params: { id: existing.id }, body });
        navigate(back);
      } else {
        const body = { name, description: description.trim() || null, groupLabel, departmentIds: selected, levels };
        // Void infers `never` for `c.json(body, 201)` responses; the route returns `{ id }`.
        const created = (await api('/api/team-instances', { method: 'POST', body })) as unknown as { id: string };
        navigate(`/teams/${created.id}`);
      }
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  return (
    <Card>
      <form className="form" onSubmit={submit}>
        <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} error={problem?.fields.name} required maxLength={255} />
        <TextAreaField
          label="Description"
          optional
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={problem?.fields.description}
          rows={3}
          maxLength={5000}
        />
        <TextField
          label="Teams are grouped by"
          hint="What a group of teams is called, such as Company or Client."
          value={groupLabel}
          onChange={(e) => setGroupLabel(e.target.value)}
          error={problem?.fields.groupLabel}
          required
          maxLength={40}
        />
        <fieldset className="check-group">
          <legend>Departments</legend>
          {departments.map((d) => (
            <label key={d.id} className="check">
              <input
                type="checkbox"
                checked={selected.includes(d.id)}
                onChange={(e) => setSelected((current) => (e.target.checked ? [...current, d.id] : current.filter((x) => x !== d.id)))}
              />
              {d.name}
            </label>
          ))}
        </fieldset>
        <fieldset className="stack-sm level-editor">
          <legend>Levels</legend>
          <p className="hint">The rounds or stages teams move through, first to last. A blank name becomes its number.</p>
          {levels.map((level, index) => (
            <TextField
              // Levels are positional: only the last one can be removed, so the index is a stable key.
              key={index}
              label={`Level ${index + 1}`}
              placeholder={`Level ${index + 1}`}
              value={level}
              onChange={(e) => setLevels((current) => current.map((value, i) => (i === index ? e.target.value : value)))}
              maxLength={60}
            />
          ))}
          <div className="cluster">
            <Button size="sm" icon="plus" disabled={levels.length >= MAX_LEVELS} onClick={() => setLevels((current) => [...current, ''])}>
              Add level
            </Button>
            <Button size="sm" variant="ghost" disabled={levels.length <= 1} onClick={() => setLevels((current) => current.slice(0, -1))}>
              Remove last level
            </Button>
          </div>
          {stranded > 0 && (
            <Alert tone="warning">
              {stranded === 1 ? 'One team is' : `${stranded} teams are`} past the new last level and will move to it.
            </Alert>
          )}
        </fieldset>
        <ProblemAlert problem={problem} fieldsShown={['name', 'description', 'groupLabel']} />
        <div className="form-actions">
          <Button variant="ghost" onClick={() => navigate(back)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim() || !groupLabel.trim() || selected.length === 0}>
            {existing ? 'Save changes' : 'Create instance'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
