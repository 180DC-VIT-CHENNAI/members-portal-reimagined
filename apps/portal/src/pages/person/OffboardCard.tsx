import { type FormEvent, useState } from 'react';
import { Alert, Button, Card, Dialog, ErrorState, LoadingBlock, ProblemAlert, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import type { PersonDetail } from '../../lib/types.ts';

export function OffboardCard({ person, onChanged }: { person: PersonDetail; onChanged: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <Card
      title="Offboarding"
      description="Ends access and hands over their work in one step: sessions, open tasks, project roles, positions, personal grants, shared-mailbox access and CRM records."
      actions={<Button size="sm" variant="danger-quiet" onClick={() => setOpen(true)}>Offboard…</Button>}
    >
      <Dialog open={open} title={`Offboard ${person.fullName}`} onClose={() => setOpen(false)}>
        {open && <OffboardForm person={person} onDone={() => { setOpen(false); onChanged(); }} />}
      </Dialog>
    </Card>
  );
}

function OffboardForm({ person, onDone }: { person: PersonDetail; onDone: () => void }) {
  const preview = useLoad(() => api('/api/people/:id/offboard', { params: { id: person.id } }), [person.id]);
  const candidates = useLoad(() => api('/api/people', { query: { status: 'active' } }), []);
  const [status, setStatus] = useState<'alumni' | 'removed'>('alumni');
  const [successorId, setSuccessorId] = useState('');
  const [reason, setReason] = useState('');
  const todayUtc = new Date().toISOString().slice(0, 10);
  const [effectiveOn, setEffectiveOn] = useState(todayUtc);
  const [handover, setHandover] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const [result, setResult] = useState<Record<string, number> | null>(null);

  if (preview.problem) return <ErrorState problem={preview.problem} onRetry={preview.reload} />;
  if (!preview.data) return <LoadingBlock rows={3} />;
  if (result) {
    return (
      <div className="stack">
        <Alert tone="success" title="Offboarding recorded.">
          {Object.entries(result).map(([key, n]) => `${key}: ${n}`).join(' · ')}
        </Alert>
        <div className="form-actions"><Button variant="primary" onClick={onDone}>Done</Button></div>
      </div>
    );
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      const items = handover.split('\n').map((line) => line.trim()).filter(Boolean).map((item) => ({ item, done: true }));
      const res = await api('/api/people/:id/offboard', {
        method: 'POST',
        params: { id: person.id },
        body: { status, successorId: successorId || null, reason, effectiveOn, handover: items },
      });
      setResult(res.summary);
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  const successors = candidates.data?.filter((p) => p.id !== person.id) ?? [];
  return (
    <form className="form" onSubmit={submit}>
      <ul className="summary-points">
        {preview.data.steps.map((step) => (
          <li key={step.key}>
            {step.label}: {step.count}
            {step.items.length > 0 && <ul>{step.items.map((item) => <li key={item.id}>{item.label}</li>)}</ul>}
          </li>
        ))}
      </ul>
      <SelectField label="Move to" value={status} onChange={(e) => setStatus(e.target.value === 'removed' ? 'removed' : 'alumni')}>
        <option value="alumni">Alumni</option>
        <option value="removed">Removed</option>
      </SelectField>
      <SelectField
        label="Successor"
        optional={!preview.data.needsSuccessor}
        hint={preview.data.needsSuccessor ? 'Takes over their open tasks, project roles and CRM records.' : 'Nothing to hand over.'}
        value={successorId}
        onChange={(e) => setSuccessorId(e.target.value)}
      >
        <option value="">No one</option>
        {successors.map((p) => <option key={p.id} value={p.id}>{p.fullName}</option>)}
      </SelectField>
      <TextAreaField label="Reason" rows={2} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} required />
      <TextField label="Effective" type="date" value={effectiveOn} max={todayUtc} onChange={(e) => setEffectiveOn(e.target.value)} />
      <TextAreaField label="Handover checklist" optional hint="One item per line, e.g. passwords rotated." rows={3} value={handover} onChange={(e) => setHandover(e.target.value)} />
      <ProblemAlert problem={problem} />
      <div className="form-actions">
        <Button variant="danger" type="submit" busy={busy} disabled={!reason.trim() || (preview.data.needsSuccessor && !successorId)}>Offboard</Button>
      </div>
    </form>
  );
}
