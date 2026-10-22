import { Button, Card, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import {
  ACTION_LABELS, AUTOMATIC_VARIABLES, type DefinitionForm, emptyField, FIELD_LABELS, FIELD_TYPES, type FieldForm, TEMPLATE_ACTIONS,
} from '../../lib/template-client.ts';

type Option = { readonly id: string; readonly name: string };

export function DefinitionEditor({ form, onChange, mailboxes, people }: {
  readonly form: DefinitionForm;
  readonly onChange: (form: DefinitionForm) => void;
  readonly mailboxes: readonly Option[];
  readonly people: readonly Option[] | null;
}) {
  const set = <K extends keyof DefinitionForm>(key: K, value: DefinitionForm[K]) => onChange({ ...form, [key]: value });
  const setField = (index: number, patch: Partial<FieldForm>) =>
    set('fields', form.fields.map((f, i) => (i === index ? { ...f, ...patch } : f)));
  const variables = [...form.fields.map((f) => f.key).filter(Boolean), ...AUTOMATIC_VARIABLES].map((k) => `{{${k}}}`).join(' ');
  return <div className="stack">
    <Card title="Fields" description="Each field becomes a {{key}} variable. Values are inserted as plain text; HTML and code are never evaluated.">
      {form.fields.map((f, i) => <fieldset key={i} className="stack-sm">
        <legend>Field {i + 1}</legend>
        <TextField label="Key" value={f.key} onChange={(e) => setField(i, { key: e.target.value })} required pattern="[a-z][a-z0-9_]{0,39}" hint="Lowercase letters, digits and _" />
        <TextField label="Label" value={f.label} onChange={(e) => setField(i, { label: e.target.value })} required maxLength={100} />
        <SelectField label="Type" value={f.type} onChange={(e) => setField(i, { type: e.target.value as FieldForm['type'] })}>
          {FIELD_TYPES.map((t) => <option key={t} value={t}>{FIELD_LABELS[t]}</option>)}
        </SelectField>
        <label className="check"><input type="checkbox" checked={f.required} onChange={(e) => setField(i, { required: e.target.checked })} />Required</label>
        <TextField label="Example" optional value={f.example} onChange={(e) => setField(i, { example: e.target.value })} maxLength={500} hint="Shown as a hint and used as preview sample data." />
        {(f.type === 'select' || f.type === 'multi_select') &&
          <TextAreaField label="Options" value={f.options} onChange={(e) => setField(i, { options: e.target.value })} rows={3} hint="One option per line." />}
        {['amount', 'short', 'long'].includes(f.type) && <div className="cluster">
          <TextField label={f.type === 'amount' ? 'Minimum' : 'Minimum length'} optional type="number" value={f.min} onChange={(e) => setField(i, { min: e.target.value })} />
          <TextField label={f.type === 'amount' ? 'Maximum' : 'Maximum length'} optional type="number" value={f.max} onChange={(e) => setField(i, { max: e.target.value })} />
        </div>}
        <Button size="sm" variant="danger-quiet" onClick={() => set('fields', form.fields.filter((_, j) => j !== i))}>Remove field</Button>
      </fieldset>)}
      <Button size="sm" onClick={() => set('fields', [...form.fields, emptyField()])}>Add field</Button>
    </Card>
    <Card title="Message">
      <TextField label="Default subject" value={form.subject} onChange={(e) => set('subject', e.target.value)} required maxLength={300} />
      <TextAreaField label="Body" value={form.body} onChange={(e) => set('body', e.target.value)} required rows={10} maxLength={30_000} hint={`Available: ${variables}`} />
      <TextAreaField label="Default signature" optional value={form.signature} onChange={(e) => set('signature', e.target.value)} rows={3} maxLength={2000} hint="Replaces the mailbox signature for drafts from this template." />
    </Card>
    <Card title="Rules">
      <fieldset className="stack-sm"><legend>Allowed sender mailboxes</legend>
        {mailboxes.length === 0 && <p className="muted">You need manage access to at least one shared mailbox.</p>}
        {mailboxes.map((m) => <label key={m.id} className="check"><input type="checkbox" checked={form.allowedMailboxIds.includes(m.id)}
          onChange={(e) => set('allowedMailboxIds', e.target.checked ? [...form.allowedMailboxIds, m.id] : form.allowedMailboxIds.filter((x) => x !== m.id))} />{m.name}</label>)}
      </fieldset>
      <TextField label="Allowed recipients" optional value={form.allowedRecipients} onChange={(e) => set('allowedRecipients', e.target.value)} hint="Leave empty to allow any recipient; otherwise separate addresses with commas." />
      <SelectField label="Category" value={form.category} onChange={(e) => set('category', e.target.value as DefinitionForm['category'])}>
        <option value="correspondence">Correspondence</option><option value="outreach">Outreach</option>
      </SelectField>
      <TextField label="Suggest a follow-up after (days)" optional type="number" min={1} max={365} value={form.followupDays} onChange={(e) => set('followupDays', e.target.value)}
        hint="Only a suggestion for the sender. Follow-ups are never sent automatically." />
    </Card>
    {people && <Card title="Per-template permission policy" description="Optional. When people are chosen for an action, only they (and only with the matching access) may take it.">
      {TEMPLATE_ACTIONS.filter((a) => a !== 'author').map((action) => <SelectField key={action} label={ACTION_LABELS[action]} optional multiple size={Math.min(5, people.length || 1)}
        value={form.policy[action] ?? []} onChange={(e) => set('policy', { ...form.policy, [action]: [...e.target.selectedOptions].map((o) => o.value) })}>
        {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </SelectField>)}
    </Card>}
  </div>;
}
