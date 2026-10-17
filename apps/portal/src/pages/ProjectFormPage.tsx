import { type FormEvent, useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextAreaField, TextField } from '../components/ui.tsx';
import { api, lookups, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { navigate } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';

const loadProject = (id: string) => api('/api/projects/:id', { params: { id } });
type Project = Awaited<ReturnType<typeof loadProject>>;
type Choice = { id: string; name: string };
type Term = { id: string; label: string; isCurrent: boolean };

/** Create a project, or edit the one with `id`. */
export function ProjectFormPage({ id }: { id?: string }) {
  const { can } = useSession();
  const project = useLoad(() => (id ? loadProject(id) : Promise.resolve(null)), [id]);
  const departments = useLoad(() => lookups.departments(), []);
  const terms = useLoad(() => lookups.terms(), []);

  const problem = project.problem ?? departments.problem ?? terms.problem;
  if (problem) return <ErrorState problem={problem} onRetry={() => [project, departments, terms].forEach((load) => load.reload())} />;
  if (project.data === undefined || !departments.data || !terms.data) return <LoadingBlock />;
  const existing = project.data;
  const allowed = existing ? existing.access.manage : can('projects.manage');
  const choices = departments.data.filter((d) => (d.active || existing?.departments.some((x) => x.id === d.id)) && can('projects.manage', d.id));

  return (
    <div className="page page-narrow">
      <BackLink to={existing ? `/projects/${existing.id}` : '/projects'}>{existing ? existing.name : 'Projects'}</BackLink>
      <PageHeader overline="Projects" title={existing ? 'Edit project' : 'New project'} />
      {allowed ? (
        <ProjectForm key={existing?.id ?? 'new'} existing={existing} departments={choices} terms={terms.data} />
      ) : (
        <EmptyState icon="clipboard" title={existing ? "You can't edit this project" : "You can't create projects"} />
      )}
    </div>
  );
}

function ProjectForm({ existing, departments, terms }: { existing: Project | null; departments: Choice[]; terms: Term[] }) {
  const [name, setName] = useState(existing?.name ?? '');
  const [client, setClient] = useState(existing?.client ?? '');
  const [termId, setTermId] = useState(existing ? (existing.termId ?? '') : (terms.find((t) => t.isCurrent)?.id ?? ''));
  const [deadline, setDeadline] = useState(existing?.deadline ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [selected, setSelected] = useState<string[]>(
    existing ? existing.departments.map((d) => d.id) : departments.length === 1 ? departments.map((d) => d.id) : [],
  );
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const back = existing ? `/projects/${existing.id}` : '/projects';

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const body = {
      name,
      client: client.trim() || null,
      termId: termId || null,
      deadline: deadline || null,
      description: description.trim() || null,
      departmentIds: selected,
    };
    try {
      if (existing) {
        await api('/api/projects/:id', { method: 'PATCH', params: { id: existing.id }, body });
        navigate(back);
      } else {
        // Void infers `never` for `c.json(body, 201)` responses; the route returns `{ id, notified }`.
        const created = (await api('/api/projects', { method: 'POST', body })) as unknown as { id: string };
        navigate(`/projects/${created.id}`);
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
        <TextField label="Client" optional value={client} onChange={(e) => setClient(e.target.value)} error={problem?.fields.client} maxLength={255} />
        <div className="form-grid">
          <SelectField label="Term" value={termId} onChange={(e) => setTermId(e.target.value)}>
            <option value="">No term</option>
            {terms.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </SelectField>
          <TextField label="Deadline" type="date" optional value={deadline} onChange={(e) => setDeadline(e.target.value)} error={problem?.fields.deadline} />
        </div>
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
        <TextAreaField
          label="Description"
          optional
          hint="Shown on the public site, with the name and client, once the project is completed."
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          error={problem?.fields.description}
          rows={5}
          maxLength={5000}
        />
        <ProblemAlert problem={problem} fieldsShown={['name', 'client', 'deadline', 'description']} />
        <div className="form-actions">
          <Button variant="ghost" onClick={() => navigate(back)} disabled={busy}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" busy={busy} disabled={!name.trim() || selected.length === 0}>
            {existing ? 'Save changes' : 'Create project'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
