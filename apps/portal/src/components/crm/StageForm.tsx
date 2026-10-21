import { type FormEvent, useState } from 'react';
import { api } from '../../lib/api.ts';
import { LOST_REASONS, type OpportunityDetail, type Stage } from '../../lib/crm-client.ts';
import { Button, Card, ProblemAlert, SelectField, TextField } from '../ui.tsx';
import { useRun } from './use-run.ts';

type Reason = keyof typeof LOST_REASONS;
const isReason = (value: string): value is Reason => Object.hasOwn(LOST_REASONS, value);
export function StageForm({ opportunity, stages, onChange }: { opportunity: OpportunityDetail; stages: Stage[]; onChange: () => void }) {
  const [stageId, setStageId] = useState(opportunity.stageId);
  const [lostReason, setLostReason] = useState<Reason>('no_response');
  const [lostNote, setLostNote] = useState('');
  const { busy, problem, run } = useRun();
  const isLost = stages.find((stage) => stage.id === stageId)?.kind === 'lost';
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void run('move', () => api('/api/crm/opportunities/:id/stage', { method: 'POST', params: { id: opportunity.id }, body: {
      stageId, lostReason: isLost ? lostReason : null, lostNote: isLost ? lostNote || null : null,
    } }), onChange);
  };
  if (opportunity.stage?.kind === 'won') return null;
  return <Card title="Move stage"><form className="form" onSubmit={submit}>
    <SelectField label="Stage" value={stageId} onChange={(e) => setStageId(e.target.value)}>
      {stages.filter((stage) => stage.kind !== 'won' && (stage.active || stage.id === opportunity.stageId)).map((stage) => <option key={stage.id} value={stage.id}>{stage.label}</option>)}
    </SelectField>
    {isLost && <><SelectField label="Reason for loss" value={lostReason} onChange={(e) => { if (isReason(e.target.value)) setLostReason(e.target.value); }}>
      {Object.entries(LOST_REASONS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </SelectField><TextField label="Context" optional value={lostNote} onChange={(e) => setLostNote(e.target.value)} maxLength={1000} /></>}
    <ProblemAlert problem={problem} /><div className="form-actions"><Button type="submit" busy={busy === 'move'} disabled={stageId === opportunity.stageId}>Move opportunity</Button></div>
  </form></Card>;
}
