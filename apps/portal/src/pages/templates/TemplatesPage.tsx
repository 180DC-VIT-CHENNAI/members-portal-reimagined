import { type FormEvent, useState } from 'react';
import { Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, lookups, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { Link, navigate } from '../../lib/router.tsx';
import { useSession } from '../../lib/session.tsx';
import { definitionFrom, type DefinitionForm, emptyForm, formFrom, loadTemplates, SCOPE_LABELS } from '../../lib/template-client.ts';
import { DefinitionEditor } from './DefinitionEditor.tsx';

export const STATUS_TONE = { draft: '', published: 'badge-success', retired: 'badge-warning' } as const;

export function useTemplateOptions() {
  const mailboxes = useLoad(() => api('/api/mailboxes'), []);
  const people = useLoad(() => api('/api/people', { query: { status: 'active' } }), []);
  return {
    mailboxes: mailboxes.data?.mailboxes.map(({ mailbox }) => ({ id: mailbox.id, name: `${mailbox.displayName} (${mailbox.address})` })) ?? [],
    people: people.problem ? null : people.data?.map((p) => ({ id: p.id, name: p.fullName })) ?? [],
  };
}

export function TemplatesPage() {
  const load = useLoad(() => loadTemplates(), []);
  return <div className="page page-narrow">
    <PageHeader title="Email templates" lede="Versioned, reviewed templates for shared mailboxes. Drafts pin the exact version they were made from." />
    <CreateTemplate />
    {load.problem ? <ErrorState problem={load.problem} onRetry={load.reload} /> : !load.data ? <LoadingBlock /> :
      load.data.templates.length === 0 ? <EmptyState icon="fileText" title="No templates you can use">Templates appear here when you can author, edit, review or draft from them.</EmptyState> :
        <ul className="stack">{load.data.templates.map(({ template, actions }) => <li key={template.id}>
          <Link to={`/templates/${template.id}`}>{template.name}</Link>{' '}
          <span className={`badge ${STATUS_TONE[template.status]}`}>{template.status}</span>
          <p className="muted">{SCOPE_LABELS[template.ownerScope]} · latest version {template.currentVersion} · you can {actions.join(', ')}</p>
        </li>)}</ul>}
  </div>;
}

function CreateTemplate() {
  const { can } = useSession();
  const options = useTemplateOptions();
  const departments = useLoad(() => lookups.departments(), []);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(''), [scope, setScope] = useState<'global' | 'department' | 'mailbox'>('mailbox'), [ownerId, setOwner] = useState('');
  const [form, setForm] = useState<DefinitionForm>(emptyForm());
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const starters = useLoad(() => scope === 'mailbox' && ownerId
    ? api('/api/mailboxes/:id/templates/starters', { params: { id: ownerId } }).then((r) => r.starters).catch(() => [])
    : Promise.resolve([]), [scope, ownerId]);
  const authorDepartments = departments.data?.filter((d) => can('templates.author', d.id)) ?? [];
  if (!options.mailboxes.length && !can('templates.author')) return null;
  if (!open) return <Button variant="primary" onClick={() => setOpen(true)}>New template</Button>;
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    try {
      const created: { id: string } = await api('/api/email-templates', { method: 'POST',
        body: { name, ownerScope: scope, ownerId: scope === 'global' ? null : ownerId, definition: definitionFrom(form) } });
      navigate(`/templates/${created.id}`);
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <Card title="New template" description="Creates version 1 as a draft. Nothing can be drafted from it until it is published.">
    <form className="form" onSubmit={submit}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
      <SelectField label="Owner" value={scope} onChange={(e) => { setScope(e.target.value as typeof scope); setOwner(''); }}>
        {options.mailboxes.length > 0 && <option value="mailbox">A shared mailbox (its managers control it)</option>}
        {authorDepartments.length > 0 && <option value="department">A department</option>}
        {can('templates.author', null) && <option value="global">Club-wide</option>}
      </SelectField>
      {scope === 'mailbox' && <SelectField label="Mailbox" value={ownerId} onChange={(e) => {
        setOwner(e.target.value); setForm({ ...form, allowedMailboxIds: e.target.value ? [e.target.value] : [] });
      }} required>
        <option value="">Choose a mailbox you manage</option>
        {options.mailboxes.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </SelectField>}
      {scope === 'department' && <SelectField label="Department" value={ownerId} onChange={(e) => setOwner(e.target.value)} required>
        <option value="">Choose a department</option>
        {authorDepartments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
      </SelectField>}
      {(starters.data?.length ?? 0) > 0 && <SelectField label="Start from a starter" optional value="" onChange={(e) => {
        const starter = starters.data?.find((s) => s.id === e.target.value);
        if (starter) { setForm(formFrom(starter.definition)); if (!name) setName(starter.name); }
      }}>
        <option value="">Blank template</option>
        {starters.data?.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </SelectField>}
      <DefinitionEditor form={form} onChange={setForm} mailboxes={options.mailboxes} people={options.people} />
      <ProblemAlert problem={problem} />
      <div className="cluster">
        <Button type="submit" variant="primary" busy={busy}>Create draft template</Button>
        <Button onClick={() => setOpen(false)}>Cancel</Button>
      </div>
    </form>
  </Card>;
}
