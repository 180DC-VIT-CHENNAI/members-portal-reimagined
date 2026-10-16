import { type FormEvent, useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { useSession } from '../../lib/session.tsx';
import type { Partner } from '../../lib/types.ts';
import { Forbidden } from './Forbidden.tsx';

interface PartnerForm {
  name: string;
  logoUrl: string;
  websiteUrl: string;
  sortOrder: string;
}

const toBody = (f: PartnerForm) => ({ name: f.name, logoUrl: f.logoUrl || null, websiteUrl: f.websiteUrl || null, sortOrder: Number(f.sortOrder) });

export function PartnersAdminPage() {
  const { can } = useSession();
  const list = useLoad(() => api('/api/content/partners'), []);
  if (!can('content.manage')) return <Forbidden title="Clients" />;
  return (
    <div className="page">
      <BackLink to="/admin">Admin</BackLink>
      <PageHeader overline="Public site" title="Clients" lede="Organisations shown in the public 'Our clients' section. Lower order sorts first." />
      <div className="stack">
        <PartnerEditor title="Add a client" initial={{ name: '', logoUrl: '', websiteUrl: '', sortOrder: '100' }} onSaved={list.reload} />
        {list.problem ? (
          <ErrorState problem={list.problem} onRetry={list.reload} />
        ) : !list.data ? (
          <LoadingBlock />
        ) : list.data.length === 0 ? (
          <EmptyState icon="heart" title="No clients yet" />
        ) : (
          list.data.map((p) => (
            <PartnerEditor
              key={p.id}
              partner={p}
              title={p.name}
              initial={{ name: p.name, logoUrl: p.logoUrl ?? '', websiteUrl: p.websiteUrl ?? '', sortOrder: String(p.sortOrder) }}
              onSaved={list.reload}
            />
          ))
        )}
      </div>
    </div>
  );
}

function PartnerEditor({ partner, title, initial, onSaved }: { partner?: Partner; title: string; initial: PartnerForm; onSaved: () => void }) {
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const set = (key: keyof PartnerForm) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const run = async (action: () => Promise<unknown>, reset: boolean) => {
    setBusy(true);
    setProblem(null);
    try {
      await action();
      if (reset) setForm(initial);
      onSaved();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    void run(
      () => (partner ? api('/api/partners/:id', { method: 'PATCH', params: { id: partner.id }, body: toBody(form) }) : api('/api/partners', { method: 'POST', body: toBody(form) })),
      !partner,
    );
  };

  return (
    <Card title={title}>
      <form className="form" onSubmit={submit}>
        <div className="form-grid">
          <TextField label="Name" value={form.name} onChange={set('name')} error={problem?.fields.name} required maxLength={120} />
          <TextField label="Logo link" optional value={form.logoUrl} onChange={set('logoUrl')} error={problem?.fields.logoUrl} placeholder="https:// or /partners/logo.png" />
          <TextField label="Website" optional value={form.websiteUrl} onChange={set('websiteUrl')} error={problem?.fields.websiteUrl} placeholder="https://" />
          <TextField label="Order" type="number" min={0} max={1000} value={form.sortOrder} onChange={set('sortOrder')} error={problem?.fields.sortOrder} />
        </div>
        <ProblemAlert problem={problem} fieldsShown={['name', 'logoUrl', 'websiteUrl', 'sortOrder']} />
        <div className="form-actions">
          {partner && (
            <Button variant="danger-quiet" icon="trash" disabled={busy} onClick={() => void run(() => api('/api/partners/:id', { method: 'DELETE', params: { id: partner.id } }), false)}>
              Remove
            </Button>
          )}
          <Button type="submit" variant="primary" icon={partner ? undefined : 'plus'} busy={busy} disabled={!form.name.trim()}>
            {partner ? 'Save' : 'Add client'}
          </Button>
        </div>
      </form>
    </Card>
  );
}
