import { useState } from 'react';
import { Alert, Button, Card, ProblemAlert, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, upload, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { navigate } from '../../lib/router.tsx';
import { type Definition, type Field, type RawValues, sampleValues, toValues } from '../../lib/template-client.ts';

const splitAddresses = (value: string) => value.split(/[,;\s]+/).filter(Boolean);
type Rendered = { subject: string; text: string; signature: string; warnings: readonly string[] };

export function TemplateUse({ mailboxId, versionId, definition, compose, initialTo = '' }: {
  readonly mailboxId: string;
  readonly versionId: string;
  readonly definition: Definition;
  readonly compose: boolean;
  readonly initialTo?: string;
}) {
  const [raw, setRaw] = useState<RawValues>({});
  const [to, setTo] = useState(initialTo);
  const [rendered, setRendered] = useState<Rendered | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false), [problem, setProblem] = useState<ApiProblem | null>(null);
  const body = () => ({ versionId, values: toValues(definition, raw), to: splitAddresses(to) });
  const run = async (action: () => Promise<void>) => {
    setBusy(true); setProblem(null); setNotice(null);
    try { await action(); } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  const preview = () => run(async () => {
    setRendered(await api('/api/mailboxes/:id/templates/preview', { method: 'POST', params: { id: mailboxId }, body: body() }));
  });
  const test = () => run(async () => {
    await api('/api/mailboxes/:id/templates/test', { method: 'POST', params: { id: mailboxId }, body: { versionId, values: toValues(definition, raw) } });
    setNotice('Test queued to your own sign-in address only.');
  });
  const draft = () => run(async () => {
    const created: { id: string } = await api('/api/mailboxes/:id/templates/drafts', { method: 'POST', params: { id: mailboxId }, body: body() });
    navigate(`/mailboxes/${mailboxId}/drafts/${created.id}`);
  });
  return <div className="stack">
    {compose && <TextField label="To" value={to} onChange={(e) => setTo(e.target.value)} required hint="Separate addresses with commas." />}
    {definition.fields.map((f) => <FieldInput key={f.key} field={f} mailboxId={mailboxId} value={raw[f.key]}
      onChange={(value) => { setRaw((current) => ({ ...current, [f.key]: value })); setRendered(null); }} />)}
    <div className="cluster">
      <Button size="sm" onClick={() => { setRaw(sampleValues(definition)); setRendered(null); }}>Fill with examples</Button>
      <Button busy={busy} onClick={preview}>Preview</Button>
      <Button busy={busy} onClick={test}>Send test to me</Button>
      {compose && <Button busy={busy} variant="primary" onClick={draft}>Create draft from template</Button>}
    </div>
    <ProblemAlert problem={problem} />
    {notice && <Alert tone="success">{notice}</Alert>}
    {rendered && <Card title="Preview" description="Exactly what a draft would contain. Variables are filled as plain text.">
      {rendered.warnings.length > 0 && <Alert tone="warning" title="Fix before drafting"><ul>{rendered.warnings.map((w) => <li key={w}>{w}</li>)}</ul></Alert>}
      <TextField label="Subject" value={rendered.subject} readOnly />
      <TextAreaField label="Message" value={rendered.text} readOnly rows={10} />
      {rendered.signature && <TextAreaField label="Signature" value={rendered.signature} readOnly rows={3} />}
    </Card>}
  </div>;
}

function FieldInput({ field: f, mailboxId, value, onChange }: {
  readonly field: Field;
  readonly mailboxId: string;
  readonly value: RawValues[string] | undefined;
  readonly onChange: (value: RawValues[string]) => void;
}) {
  const text = typeof value === 'string' ? value : '';
  const common = { label: f.label, optional: !f.required, hint: f.example ? `Example: ${f.example}` : undefined };
  switch (f.type) {
    case 'long': return <TextAreaField {...common} value={text} onChange={(e) => onChange(e.target.value)} rows={4} />;
    case 'rows': return <TextAreaField {...common} value={text} onChange={(e) => onChange(e.target.value)} rows={4}
      hint={`One row per line; separate columns with |.${f.example ? ` Example: ${f.example}` : ''}`} />;
    case 'date': return <TextField {...common} type="date" value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'amount': return <TextField {...common} type="number" step="any" value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'url': return <TextField {...common} type="url" value={text} onChange={(e) => onChange(e.target.value)} />;
    case 'boolean': return <label className="check"><input type="checkbox" checked={value === true} onChange={(e) => onChange(e.target.checked)} />{f.label}</label>;
    case 'select': return <SelectField {...common} value={text} onChange={(e) => onChange(e.target.value)}>
      <option value="">Choose…</option>{f.options.map((o) => <option key={o} value={o}>{o}</option>)}
    </SelectField>;
    case 'multi_select': return <fieldset className="stack-sm"><legend>{f.label}</legend>
      {f.options.map((o) => { const chosen = Array.isArray(value) ? value : []; return <label key={o} className="check">
        <input type="checkbox" checked={chosen.includes(o)} onChange={(e) => onChange(e.target.checked ? [...chosen, o] : chosen.filter((x) => x !== o))} />{o}</label>; })}
    </fieldset>;
    case 'organization': return <CrmPicker {...common} kind="organization" value={text} onChange={onChange} />;
    case 'contact': return <CrmPicker {...common} kind="contact" value={text} onChange={onChange} />;
    case 'attachment': return <AttachmentInput {...common} mailboxId={mailboxId} value={text} onChange={onChange} />;
    default: return <TextField {...common} value={text} onChange={(e) => onChange(e.target.value)} />;
  }
}

function CrmPicker({ kind, label, optional, value, onChange }: {
  readonly kind: 'organization' | 'contact'; readonly label: string; readonly optional: boolean; readonly value: string; readonly onChange: (value: string) => void;
}) {
  const load = useLoad(async () => kind === 'organization'
    ? (await api('/api/crm/organizations', { query: {} })).map((o) => ({ id: o.id, name: o.name }))
    : (await api('/api/crm/contacts', { query: {} })).map((c) => ({ id: c.id, name: c.email ? `${c.fullName} <${c.email}>` : c.fullName })), [kind]);
  if (load.problem) return <Alert tone="warning" title={label}>You need CRM access to choose a {kind}.</Alert>;
  return <SelectField label={label} optional={optional} value={value} onChange={(e) => onChange(e.target.value)}
    hint={kind === 'contact' ? 'Only contacts with granted consent and no do-not-contact flag can be used.' : undefined}>
    <option value="">{load.data ? 'Choose…' : 'Loading…'}</option>
    {load.data?.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
  </SelectField>;
}

function AttachmentInput({ label, optional, mailboxId, value, onChange }: {
  readonly label: string; readonly optional: boolean; readonly mailboxId: string; readonly value: string; readonly onChange: (value: string) => void;
}) {
  const [name, setName] = useState<string | null>(null), [problem, setProblem] = useState<ApiProblem | null>(null), [busy, setBusy] = useState(false);
  const attach = async (file: File) => {
    setBusy(true); setProblem(null);
    const form = new FormData(); form.set('file', file);
    try {
      const item = await upload<{ id: string; filename: string }>(`/api/mailboxes/${mailboxId}/attachments`, form);
      setName(item.filename); onChange(item.id);
    } catch (error) { setProblem(problemFrom(error)); } finally { setBusy(false); }
  };
  return <div className="stack-sm">
    <TextField label={label} optional={optional} type="file" disabled={busy} hint={value && name ? `Attached: ${name}` : 'At most 3 MiB in total; stored privately in this mailbox.'}
      onChange={(e) => { const file = e.target.files?.[0]; if (file) void attach(file); }} />
    <ProblemAlert problem={problem} />
  </div>;
}
