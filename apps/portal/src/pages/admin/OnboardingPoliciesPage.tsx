import { type FormEvent, useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { useSession } from '../../lib/session.tsx';
import { Forbidden } from './Forbidden.tsx';

export function OnboardingPoliciesPage() {
  const { can } = useSession();
  const policies = useLoad(() => api('/api/onboarding/policies'), []);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  if (!can('onboarding.manage')) return <Forbidden title="Onboarding policies" />;

  const toggle = async (id: string, active: boolean) => {
    setProblem(null);
    try {
      await api('/api/onboarding/policies/:id', { method: 'PATCH', params: { id }, body: { active } });
      policies.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    }
  };

  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Organisation" title="Onboarding policies" lede="Policies every member acknowledges from their first-login checklist." />
      <div className="stack">
        <Card title="Policies" flush>
          {policies.problem ? (
            <ErrorState problem={policies.problem} onRetry={policies.reload} />
          ) : !policies.data ? (
            <LoadingBlock rows={3} />
          ) : policies.data.length === 0 ? (
            <EmptyState icon="fileText" title="No policies yet" />
          ) : (
            <ul className="stack card-inner">
              {policies.data.map((p) => (
                <li key={p.id} className="row-between">
                  <div className="stack-sm">
                    <strong>{p.title}</strong>
                    {p.description && <p className="caption muted">{p.description}</p>}
                    {p.href && <span className="caption mono wrap-anywhere">{p.href}</span>}
                  </div>
                  <Button size="sm" variant={p.active ? 'danger-quiet' : 'secondary'} onClick={() => void toggle(p.id, !p.active)}>
                    {p.active ? 'Retire' : 'Restore'}
                  </Button>
                </li>
              ))}
            </ul>
          )}
          <ProblemAlert problem={problem} />
        </Card>
        <NewPolicy onCreated={policies.reload} />
      </div>
    </div>
  );
}

function NewPolicy({ onCreated }: { onCreated: () => void }) {
  const [form, setForm] = useState({ title: '', description: '', href: '' });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/onboarding/policies', { method: 'POST', body: { title: form.title, description: form.description, href: form.href.trim() || null } });
      setForm({ title: '', description: '', href: '' });
      onCreated();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Add a policy">
      <form className="form" onSubmit={submit} noValidate>
        <TextField label="Title" value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} error={problem?.fields.title} required />
        <TextAreaField label="What to read" optional rows={2} maxLength={500} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        <TextField label="Link" optional hint="An https:// document or a portal path such as /files." value={form.href} onChange={(e) => setForm({ ...form, href: e.target.value })} error={problem?.fields.href} />
        <ProblemAlert problem={problem} fieldsShown={['title', 'href']} />
        <div className="form-actions">
          <Button type="submit" variant="primary" icon="plus" busy={busy} disabled={!form.title.trim()}>Add policy</Button>
        </div>
      </form>
    </Card>
  );
}
