import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextField } from '../../components/ui.tsx';
import { api, lookups, problemFrom, upload, useLoad } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import { today } from '../../lib/format.ts';
import { isLetterType, LETTER_LABELS, LETTER_TYPES, MAX_LETTER_EMAIL_BYTES, type LetterType } from '../../lib/letter-kinds.ts';
import type { SavedPdf } from '../../lib/letter-client.ts';
import { collectLetterData, POSITION_OPTIONS, TEAM_OPTIONS, validateLetterForm } from '../../lib/letters/templates.ts';
import { generateLetterPdf, LetterRenderError, renderLetter } from '../../lib/letters/render.ts';
import '../../lib/letters/document.css';
import printCss from '../../lib/letters/document.css?inline';
import { useSession } from '../../lib/session.tsx';
import { Forbidden } from '../admin/Forbidden.tsx';
import { LetterFields } from './LetterFields.tsx';
import { LetterHistory } from './LetterHistory.tsx';
import { LetterPreview, type LetterPreviewData } from './LetterPreview.tsx';
import { LetterSendDialog } from './LetterSendDialog.tsx';

export function LetterStudioPage() {
  const { can }=useSession();
  const departments=useLoad(()=>lookups.departments(),[]),positions=useLoad(()=>lookups.positions(),[]);
  if(!can('letters.manage'))return <Forbidden title="Letter studio"/>;
  const problem=departments.problem??positions.problem;
  if(problem)return <ErrorState problem={problem} onRetry={()=>{departments.reload();positions.reload()}}/>;
  if(!departments.data||!positions.data)return <LoadingBlock/>;
  return <Studio departments={departments.data.filter(d=>d.active&&can('letters.manage',d.id))} positions={positions.data.filter(p=>p.active).map(p=>p.title)}/>;
}

function Studio({departments,positions}:{readonly departments:readonly {id:string;name:string}[];readonly positions:readonly string[]}) {
  const { can,me }=useSession();
  const first=departments[0];
  const [scope,setScope]=useState(can('letters.manage',null)?'':first?.id??'');
  const [form,setForm]=useState<Record<string,string>>(()=>({
    'f-type':'appointment','f-date':today(),'f-position':'Junior Consultant','f-position-from':'Junior Consultant','f-position-to':'Consultant',
    'f-team':first?.name??'Business Strategy','f-team-from':first?.name??'Business Strategy','f-team-to':'Technical','f-ffcs':'FFCS','f-performance':'Satisfactory',
    'f-announcement-sender':me.fullName,'f-announcement-tone':'neutral','f-announcement-kind':'general','f-announcement-event-mode':'In-person',
    'f-report-department':first?.name??'Business Strategy','f-satisfaction':'Neutral','f-relieving-rating':'Good','f-sc-type':'Incident',
    'f-ldi-submitter':me.fullName,'f-ldi-date':today(),'f-ldi-department':first?.name??'Business Strategy','f-ldi-category':'New Initiative','f-ldi-priority':'Medium','f-ldi-decision':'Review and Discuss',
  }));
  const [type,setType]=useState<LetterType>('appointment');
  const [logo,setLogo]=useState(''),[vector,setVector]=useState(false);
  const [busy,setBusy]=useState<'preview'|'download'|'save'|null>(null),[problem,setProblem]=useState<ApiProblem|null>(null);
  const [preview,setPreview]=useState<LetterPreviewData|null>(null),[revision,setRevision]=useState(0);
  const [saved,setSaved]=useState<(SavedPdf&{readonly departmentId:string|null})|null>(null),[sending,setSending]=useState(false);
  const [notice,setNotice]=useState('');
  const formRef=useRef<HTMLFormElement>(null),downloadUrl=useRef<string|null>(null);
  const people=useLoad(()=>api('/api/letters/recipients'),[]);
  useEffect(()=>()=>{if(downloadUrl.current)URL.revokeObjectURL(downloadUrl.current)},[]);
  const change=(key:string,value:string)=>{setForm(current=>({...current,[key]:value}));setPreview(null)};
  const renderProblem=(message:string)=>setProblem({status:null,code:'letter_render',message,fields:{}});
  const prepare=async(mode:'preview'|'download'|'save')=>{
    if(!formRef.current?.reportValidity())return;
    const validation=validateLetterForm(form);
    if(!validation.ok){renderProblem(validation.message);return}
    const departmentId=scope||null;
    if(!can('letters.manage',departmentId)){renderProblem('Choose a department you manage.');return}
    setBusy(mode);setProblem(null);setNotice('');
    // These values are frozen before awaiting rendering; later form changes never alter the saved PDF metadata.
    const data=collectLetterData({...form},logo);
    try{
      const rendered=await renderLetter(data,{vectorLetterhead:vector});
      try{
        const width=rendered.pages[0]?.offsetWidth??794;
        const height=rendered.pages.reduce((sum,page)=>sum+page.offsetHeight+24,0);
        setPreview({pagesHtml:rendered.pagesHtml,pageCount:rendered.pageCount,width,height,docnum:data.docnum});
        if(mode==='preview')return;
        const pdf=await generateLetterPdf(rendered,{maxBytes:MAX_LETTER_EMAIL_BYTES,title:data.docnum});
        if(mode==='download'){
          if(downloadUrl.current)URL.revokeObjectURL(downloadUrl.current);
          const url=URL.createObjectURL(pdf.blob);downloadUrl.current=url;
          const link=document.createElement('a');link.href=url;link.download=`${data.docnum}-${data.type}.pdf`;link.click();
          setNotice(`PDF downloaded (${pdf.pageCount} ${pdf.pageCount===1?'page':'pages'}).${pdf.emailable?'':' It is too large to email; download or print it instead.'}`);
        }else{
          const body=new FormData();body.append('file',pdf.blob,`${data.docnum}.pdf`);
          const snapshot:Record<string,string>=Object.fromEntries(Object.entries(data));
          body.append('metadata',JSON.stringify({departmentId,data:snapshot}));
          const record=await upload<SavedPdf>('/api/letters',body);setSaved({...record,departmentId});setRevision(r=>r+1);setNotice('PDF saved. The saved document and metadata cannot change.');
        }
      }finally{rendered.dispose()}
    }catch(err){if(err instanceof LetterRenderError)renderProblem(err.message);else setProblem(problemFrom(err))}finally{setBusy(null)}
  };
  const printPreview=async()=>{
    if(!preview)return;
    const popup=window.open('','_blank');
    if(!popup){renderProblem('Allow popups to open the print preview.');return}
    popup.document.write(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>180DC letter</title><base href="${window.location.origin}/"><style>@page{size:A4;margin:0}body{margin:0;background:white}${printCss}</style></head><body><div class="letter-document">${preview.pagesHtml}</div></body></html>`);popup.document.close();
    try{await popup.document.fonts.ready;await Promise.all([...popup.document.images].map(image=>image.decode()));popup.print()}
    catch(err){if(!(err instanceof Error))throw err;renderProblem('The print artwork could not load. Try downloading the PDF instead.')}
  };
  const pickLogo=async(file:File|undefined)=>{
    if(!file)return;
    if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>100*1024){renderProblem('Use a PNG, JPEG or WebP logo up to 100 KB.');return}
    const reader=new FileReader();
    reader.addEventListener('load',()=>{if(typeof reader.result==='string'){setLogo(reader.result);setPreview(null);setProblem(null)}});
    reader.addEventListener('error',()=>renderProblem('The logo could not be read.'));reader.readAsDataURL(file);
  };
  const titles=[...new Set([...POSITION_OPTIONS,...positions])],teams=[...new Set([...TEAM_OPTIONS,...departments.map(d=>d.name)])];
  return <div className="page"><PageHeader overline="Official correspondence" title="Letter studio" lede="Compose, preview and export branded documents. Saving freezes a PDF; sending always uses that saved version."/>
    <div className="stack">
      <Alert tone="info">Template signatories and signature marks are printed text, not cryptographic signatures. Review authority, dates and content before issuing an official document.</Alert>
      {notice&&<Alert tone="success">{notice}</Alert>}
      <form ref={formRef} className="stack" onSubmit={event=>{event.preventDefault();void prepare('preview')}}>
        <fieldset className="letter-form-fields stack" disabled={busy!==null}>
          <Card title="Document setup"><div className="form-grid">
            <SelectField label="Document type" value={type} onChange={event=>{const value=event.target.value;if(isLetterType(value)){setType(value);change('f-type',value);setPreview(null)}}}>{LETTER_TYPES.map(value=><option key={value} value={value}>{LETTER_LABELS[value]}</option>)}</SelectField>
            <TextField label="Document date" type="date" value={form['f-date']??''} required onChange={e=>change('f-date',e.target.value)}/>
            <SelectField label="Access department" value={scope} required={!can('letters.manage',null)} onChange={e=>setScope(e.target.value)} hint="Controls who can read this saved document; the template's team label is separate.">
              {can('letters.manage',null)&&<option value="">Club-wide / restricted to global access</option>}{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}
            </SelectField>
            <SelectField label="Artwork" value={vector?'vector':'standard'} onChange={e=>{setVector(e.target.value==='vector');setPreview(null)}}><option value="standard">Standard letterhead</option><option value="vector">Vector letterhead</option></SelectField>
            {!['announcement','department-report','ldi','mou'].includes(type)&&<SelectField label="Fill from a member" value="" onChange={event=>{const p=people.data?.find(p=>p.id===event.target.value);if(p){setForm(current=>({...current,'f-name':p.fullName,'f-reg':p.regNo??''}));setPreview(null)}}}><option value="">Choose a person (optional)</option>{people.data?.map(p=><option key={p.id} value={p.id}>{p.fullName}</option>)}</SelectField>}
          </div><ProblemAlert problem={people.problem}/></Card>
          <LetterFields type={type} values={form} onChange={change} positions={titles} teams={teams}/>
          {type==='mou'&&<Card title="Other party logo"><TextField label="Logo" type="file" accept="image/png,image/jpeg,image/webp" optional hint="PNG, JPEG or WebP, up to 100 KB." onChange={event=>void pickLogo(event.target.files?.[0])}/>{logo&&<Button size="sm" variant="ghost" onClick={()=>{setLogo('');setPreview(null)}}>Clear logo</Button>}</Card>}
        </fieldset>
        <ProblemAlert problem={problem}/>
        <div className="cluster"><Button type="submit" busy={busy==='preview'} disabled={busy!==null&&busy!=='preview'}>Preview</Button><Button variant="primary" busy={busy==='download'} disabled={busy!==null&&busy!=='download'} onClick={()=>void prepare('download')}>Download PDF</Button><Button busy={busy==='save'} disabled={busy!==null&&busy!=='save'} onClick={()=>void prepare('save')}>Save PDF</Button><Button disabled={!preview||busy!==null} onClick={()=>void printPreview()}>Print preview</Button></div>
      </form>
      {preview&&<LetterPreview preview={preview}/>}
      {saved&&<div className="cluster"><a className="btn btn-secondary" href={saved.downloadUrl} target="_blank" rel="noopener noreferrer">Open saved PDF</a>{can('letters.send',saved.departmentId)&&<Button disabled={!saved.emailEligible} onClick={()=>setSending(true)}>Email saved PDF</Button>}<span className="caption muted">{saved.docnum}{saved.emailEligible?'':' · Too large to email'}</span></div>}
      <LetterHistory revision={revision}/>
    </div>
    {sending&&saved&&<LetterSendDialog document={saved} onClose={()=>setSending(false)} onQueued={()=>{setSending(false);setNotice('Email queued. Check delivery history for provider acceptance.');setRevision(r=>r+1)}}/>}
  </div>;
}
