import { useState } from 'react';
import { Button, Card, Dialog, EmptyState, ErrorState, LoadingBlock } from '../../components/ui.tsx';
import { useLoad } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/format.ts';
import { loadLetter, loadLetters, type SavedLetter } from '../../lib/letter-client.ts';
import { useSession } from '../../lib/session.tsx';
import { LetterSendDialog } from './LetterSendDialog.tsx';

export function LetterHistory({ revision }: { readonly revision:number }) {
  const { can }=useSession();
  const letters=useLoad(loadLetters,[revision]);
  const [detail,setDetail]=useState<SavedLetter|null>(null),[sending,setSending]=useState<SavedLetter|null>(null);
  return <Card title="Saved PDFs" description="Immutable documents and their delivery history. Print from the PDF viewer." actions={<Button size="sm" disabled={letters.loading} onClick={letters.reload}>Refresh</Button>}>
    {letters.problem?<ErrorState problem={letters.problem} onRetry={letters.reload}/>:!letters.data?<LoadingBlock/>:!letters.data.length?<EmptyState icon="fileText" title="No saved PDFs yet">Compose a document above and choose Save PDF.</EmptyState>:
      <div className="table-wrap"><table className="table table-stack"><thead><tr><th>Document</th><th>Reference</th><th>Saved</th><th>Actions</th></tr></thead><tbody>{letters.data.map(doc=><tr key={doc.id}>
        <td className="cell-primary">{doc.label}<div className="caption muted">{doc.name}</div></td><td data-label="Reference">{doc.docnum}</td><td data-label="Saved">{formatDateTime(doc.createdAt)}</td><td data-label="Actions"><div className="cluster">
          <a className="btn btn-secondary btn-sm" href={doc.downloadUrl} target="_blank" rel="noopener noreferrer">Open / print</a><Button size="sm" onClick={()=>setDetail(doc)}>Delivery history</Button>{can('letters.send',doc.departmentId)&&<Button size="sm" disabled={!doc.emailEligible} onClick={()=>setSending(doc)}>Email PDF</Button>}
        </div></td>
      </tr>)}</tbody></table></div>}
    {detail&&<LetterDetailDialog id={detail.id} onClose={()=>setDetail(null)}/>}
    {sending&&<LetterSendDialog document={sending} onClose={()=>setSending(null)} onQueued={()=>{setSending(null);letters.reload()}}/>}
  </Card>;
}
const SEND_LABEL = { queued:'Queued',accepted:'Provider accepted',failed:'Failed',uncertain:'Acceptance uncertain' } as const;
function LetterDetailDialog({ id,onClose }: {readonly id:string;readonly onClose:()=>void}) {
  const detail=useLoad(()=>loadLetter(id),[id]);
  return <Dialog open title="Delivery history" onClose={onClose}><div className="stack">
    {detail.problem?<ErrorState problem={detail.problem} onRetry={detail.reload}/>:!detail.data?<LoadingBlock rows={2}/>:<>
      <p>{detail.data.docnum} · {detail.data.filename}</p>
      {!detail.data.sends.length?<EmptyState icon="inbox" title="No emails queued for this PDF"/>:<ul className="stack activity-list">{detail.data.sends.map(send=><li key={send.id} className="stack-sm"><strong>{send.recipient}</strong><span className="badge">{SEND_LABEL[send.status]}</span><time className="caption muted" dateTime={send.createdAt}>{formatDateTime(send.createdAt)}</time>{send.lastError&&<p className="caption muted">{send.lastError}</p>}</li>)}</ul>}
      <p className="caption muted">Accepted means the provider accepted the message, not that it reached the inbox. Unknown outcomes are never automatically resent; retries may duplicate a message.</p>
    </>}
    <div className="dialog-actions"><Button size="sm" onClick={detail.reload}>Refresh</Button><Button onClick={onClose}>Close</Button></div>
  </div></Dialog>;
}
