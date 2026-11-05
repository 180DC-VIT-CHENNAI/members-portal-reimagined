import { useState } from 'react';
import { Card, ErrorState, LoadingBlock, SelectField } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import { Link } from '../../lib/router.tsx';
import { loadMailboxTemplates } from '../../lib/template-client.ts';
import { TemplateUse } from '../templates/TemplateUse.tsx';

export function TemplateCompose({ id }: { readonly id: string }) {
  const query = new URLSearchParams(window.location.search);
  const load = useLoad(() => loadMailboxTemplates(id), [id]);
  const [templateId, setTemplate] = useState(query.get('template') ?? '');
  if (load.problem) return <ErrorState problem={load.problem} onRetry={load.reload} />;
  if (!load.data) return <LoadingBlock rows={2} />;
  const templates = load.data.templates;
  if (!templates.length) return null;
  const chosen = templates.find((t) => t.id === templateId);
  return <Card title="Start from a template" description="The draft pins the published version. You can still revise it before review.">
    <SelectField label="Template" optional value={templateId} onChange={(e) => setTemplate(e.target.value)}>
      <option value="">Write without a template</option>
      {templates.map((t) => <option key={t.id} value={t.id}>{t.name} (version {t.version})</option>)}
    </SelectField>
    {chosen && <TemplateUse key={chosen.versionId} mailboxId={id} versionId={chosen.versionId} definition={chosen.definition} compose initialTo={query.get('to') ?? ''} />}
  </Card>;
}

export function FollowUps({ id }: { readonly id: string }) {
  const load = useLoad(() => api('/api/mailboxes/:id/templates/reminders', { params: { id } }), [id]);
  if (!load.data?.reminders.length) return null;
  return <Card title="Follow-ups to consider" description="Suggestions only. Nothing is drafted or sent unless you choose to.">
    <ul className="stack">{load.data.reminders.map((r) => <li key={r.draftId}>
      <Link to={`/mailboxes/${id}/drafts/${r.draftId}`}>{r.subject}</Link>
      <p className="muted">Sent {new Date(r.sentAt).toLocaleDateString()} to {r.to.join(', ')} · {' '}
        <Link to={`/mailboxes/${id}/compose?template=${encodeURIComponent(r.templateId)}&to=${encodeURIComponent(r.to.join(', '))}`}>Draft a follow-up</Link></p>
    </li>)}</ul>
  </Card>;
}
