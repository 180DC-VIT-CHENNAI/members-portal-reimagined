import { useState } from 'react';
import { Button, Card, ConfirmDialog, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { STATUS_LABEL, TRANSITIONS } from '../../lib/format.ts';
import type { PersonDetail, PersonStatus } from '../../lib/types.ts';

const STATUS_HELP: Record<PersonStatus, string> = {
  invited: 'Can sign in for the first time with Google.',
  active: 'Full access for their role.',
  on_leave: 'Keeps access while away.',
  alumni: 'Access ends now. The profile and history stay.',
  removed: 'Access ends now. The profile and history stay.',
};

export function StatusCard({ person, onChanged }: { person: PersonDetail; onChanged: () => void }) {
  const options = TRANSITIONS[person.status];
  const [target, setTarget] = useState<PersonStatus | null>(null);
  const [note, setNote] = useState('');
  const todayUtc = new Date().toISOString().slice(0, 10);
  const [effectiveOn, setEffectiveOn] = useState(todayUtc);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const endsAccess = target === 'alumni' || target === 'removed';

  const confirm = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await api('/api/people/:id/status', { method: 'POST', params: { id: person.id }, body: { status: target, reason: note.trim() || undefined, effectiveOn } });
      setTarget(null);
      setNote('');
      setProblem(null);
      onChanged();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card title="Status" description={`Currently ${STATUS_LABEL[person.status].toLowerCase()}. ${STATUS_HELP[person.status]}`}>
      <div className="cluster">
        {options.map((s) => (
          <Button key={s} variant={s === 'alumni' || s === 'removed' ? 'danger-quiet' : 'secondary'} onClick={() => setTarget(s)}>
            {person.status === 'removed' && s === 'active' ? 'Reinstate' : `Move to ${STATUS_LABEL[s].toLowerCase()}`}
          </Button>
        ))}
      </div>
      <ConfirmDialog
        open={target !== null}
        title={target ? `Move ${person.fullName} to ${STATUS_LABEL[target].toLowerCase()}?` : ''}
        confirmLabel={note.trim() ? 'Change status' : 'Add a reason first'}
        tone={endsAccess ? 'danger' : 'primary'}
        busy={busy}
        problem={problem}
        onConfirm={() => {
          if (note.trim()) void confirm();
        }}
        onClose={() => {
          setTarget(null);
          setProblem(null);
        }}
      >
        {target && <p>{STATUS_HELP[target]}</p>}
        {endsAccess && <p>They are signed out everywhere straight away.</p>}
        <TextAreaField label="Reason" hint="Saved in their status history." rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} required />
        <TextField label="Effective" type="date" value={effectiveOn} max={todayUtc} onChange={(e) => setEffectiveOn(e.target.value)} />
      </ConfirmDialog>
    </Card>
  );
}
