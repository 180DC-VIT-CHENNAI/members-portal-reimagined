import { type FormEvent, useState } from 'react';
import { Alert, BackLink, Button, Card, ConfirmDialog, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { definitionFrom, type DefinitionForm, formFrom, loadTemplate, SCOPE_LABELS, type TemplateDetail } from '../../lib/template-client.ts';
import { DefinitionEditor } from './DefinitionEditor.tsx';
import { STATUS_TONE, useTemplateOptions } from './TemplatesPage.tsx';
import { TemplateUse } from './TemplateUse.tsx';

export function TemplatePage({ id }: { readonly id: string }) {
  const load = useLoad(() => loadTemplate(id), [id]);
  const options = useTemplateOptions();
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const [retiring, setRetiring] = useState(false);
  if (load.problem) return <div className="page"><ErrorState problem={load.problem} onRetry={load.reload} /></div>;
  if (!load.data || load.loading) return <LoadingBlock />;
  const { template, latest, actions, versions } = load.data;
  const status = (action: 'publish' | 'retire') => async () => {
    setBusy(true); setProblem(null);
    try {
      await api('/api/email-templates/:id/status', { method: 'POST', params: { id }, body: { version: template.currentVersion, action } });
      setRetiring(false); load.reload();
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  const retired = template.status === 'retired';
  const latestPublished = template.publishedVersionId === latest.id;
  return <div className="page page-narrow">
    <BackLink to="/templates">Email templates</BackLink>
    <PageHeader title={template.name} lede={`${SCOPE_LABELS[template.ownerScope]} template · latest version ${template.currentVersion}`} actions={
      <span className={`badge ${STATUS_TONE[template.status]}`}>{template.status}</span>} />
    <ProblemAlert problem={problem} />
    {retired && <Alert tone="warning" title="Retired">No new drafts can use this template. Messages already sent keep their frozen content.</Alert>}
    {!retired && !latestPublished && template.status === 'published' &&
      <Alert tone="info" title="Unpublished changes">Drafts still use the published version until version {template.currentVersion} is published.</Alert>}
    {!retired && <div className="cluster">
      {actions.includes('publish') && !latestPublished && <Button variant="primary" busy={busy} onClick={status('publish')}>Publish version {template.currentVersion}</Button>}
      {actions.includes('retire') && <Button variant="danger-quiet" busy={busy} onClick={() => setRetiring(true)}>Retire template</Button>}
    </div>}
    <ConfirmDialog open={retiring} title="Retire this template?" confirmLabel="Retire" tone="danger" busy={busy} problem={problem}
      onConfirm={status('retire')} onClose={() => setRetiring(false)}>
      Members can no longer draft from it, and drafts made from it cannot be submitted, approved or sent. This cannot be undone.
    </ConfirmDialog>
    {!retired && actions.includes('edit') && <EditVersion key={latest.id} detail={load.data} options={options} onSaved={load.reload} />}
    {!retired && <TryTemplate detail={load.data} mailboxes={options.mailboxes} />}
    <Card title="Version history" description="Versions are immutable. Drafts and approvals reference the exact version they used.">
      <ul className="stack">{versions.map((v) => <li key={v.id}>Version {v.version}
        {v.id === template.publishedVersionId && <span className="badge badge-success"> published</span>}
        <span className="muted"> — {new Date(v.createdAt.replace(' ', 'T') + 'Z').toLocaleString()}</span></li>)}</ul>
    </Card>
  </div>;
}

function EditVersion({ detail, options, onSaved }: {
  readonly detail: TemplateDetail; readonly options: ReturnType<typeof useTemplateOptions>; readonly onSaved: () => void;
}) {
  const [form, setForm] = useState<DefinitionForm>(formFrom(detail.latest.definition));
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    try {
      await api('/api/email-templates/:id/versions', { method: 'POST', params: { id: detail.template.id }, body: { version: detail.template.currentVersion, definition: definitionFrom(form) } });
      onSaved();
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <details className="card">
    <summary>Edit as version {detail.template.currentVersion + 1}</summary>
    <form className="form" onSubmit={submit}>
      <DefinitionEditor form={form} onChange={setForm} mailboxes={options.mailboxes} people={options.people} />
      <ProblemAlert problem={problem} />
      <Button type="submit" variant="primary" busy={busy}>Save new version</Button>
    </form>
  </details>;
}

function TryTemplate({ detail, mailboxes }: { readonly detail: TemplateDetail; readonly mailboxes: readonly { readonly id: string; readonly name: string }[] }) {
  const usable = mailboxes.filter((m) => detail.latest.definition.allowedMailboxIds.includes(m.id));
  const [mailboxId, setMailbox] = useState('');
  const chosen = mailboxId || usable[0]?.id;
  if (!detail.actions.includes('draft')) return null;
  return <Card title={`Preview version ${detail.latest.version} with sample data`} description="Preview and self-tests use one of the template's allowed mailboxes where you can draft.">
    {usable.length === 0 ? <p className="muted">You have no access to any of this template's allowed mailboxes.</p> : <>
      {usable.length > 1 && <SelectField label="Mailbox" value={chosen} onChange={(e) => setMailbox(e.target.value)}>
        {usable.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
      </SelectField>}
      {chosen && <TemplateUse key={`${chosen}-${detail.latest.id}`} mailboxId={chosen} versionId={detail.latest.id} definition={detail.latest.definition} compose={false} />}
    </>}
  </Card>;
}
