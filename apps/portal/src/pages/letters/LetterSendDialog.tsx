import { type FormEvent, useState } from 'react';
import { Alert, Button, Dialog, ErrorState, LoadingBlock, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, problemFrom, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { useSession } from '../../lib/session.tsx';

export function LetterSendDialog({ document, onClose, onQueued }: { readonly document: { readonly id:string; readonly filename:string; readonly departmentId:string|null; readonly emailEligible:boolean }; readonly onClose:()=>void; readonly onQueued:()=>void }) {
  const { can, me } = useSession();
  const people = useLoad(()=>api('/api/letters/recipients'),[]);
  const [email,setEmail]=useState(''),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
  const [busy,setBusy]=useState(false),[problem,setProblem]=useState<ApiProblem|null>(null);
  const change=(value:string)=>{setEmail(value);setRequestId(crypto.randomUUID());setProblem(null)};
  const submit=async(event:FormEvent)=>{event.preventDefault();setBusy(true);setProblem(null);try{await api('/api/letters/:id/send',{method:'POST',params:{id:document.id},body:{recipientEmail:email,requestId}});onQueued()}catch(err){setProblem(problemFrom(err))}finally{setBusy(false)}};
  return <Dialog open title="Email saved PDF" onClose={busy?()=>{}:onClose}><form className="form" onSubmit={submit}>
    <p>{document.filename}</p><p className="caption muted">Replies go to {me.email}. Provider acceptance is recorded in delivery history; it isn't proof of inbox delivery.</p>
    {!document.emailEligible && <Alert tone="warning">This PDF is too large to email. Download it or export a smaller version.</Alert>}
    {people.problem?<ErrorState problem={people.problem} onRetry={people.reload}/>:!people.data?<LoadingBlock rows={2}/>:<SelectField label="Member recipient" value={people.data.some(p=>p.email===email)?email:''} onChange={(e)=>change(e.target.value)} disabled={busy}>
      <option value="">Choose a person</option>{people.data.filter(p=>can('letters.send',p.departmentId)).map(p=><option key={p.id} value={p.email}>{p.fullName} ({p.email})</option>)}
    </SelectField>}
    {can('letters.send',null) && <TextField label="Or another email" type="email" value={email} onChange={(e)=>change(e.target.value)} maxLength={254} disabled={busy} hint="Only a global sender can email an external recipient."/>}
    <ProblemAlert problem={problem}/><div className="dialog-actions"><Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!email || !document.emailEligible || !can('letters.send',document.departmentId)}>Queue email</Button></div>
  </form></Dialog>;
}
