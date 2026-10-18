import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { before, beforeEach, after, test } from 'node:test';
import { startPortal, signIn, anonymous } from './harness.mjs';
let portal, admin, finance, marketing, member, visitor;
before(async () => {
  portal=await startPortal({EMAIL_TEST_MODE:'capture'}); admin=signIn(portal,'srijan.guchhait@gmail.com');
  for(const [email,departmentId,accessRoleId] of [['finance.director@example.com','finance','director'],['marketing.director@example.com','marketing','director'],['member@example.com','finance','member']])assert.equal((await admin.post('/api/people',{email,fullName:email.split('@')[0],departmentId,accessRoleId})).status,201);
  finance=signIn(portal,'finance.director@example.com');marketing=signIn(portal,'marketing.director@example.com');member=signIn(portal,'member@example.com');visitor=anonymous(portal);
});
after(async()=>{await portal?.stop()});
beforeEach(()=>{portal.db.exec('DELETE FROM letter_sends; DELETE FROM letter_documents; DELETE FROM email_deliveries; DELETE FROM email_queue; DELETE FROM dev_outbox; DELETE FROM rate_limits; DELETE FROM email_hour_count;')});
const snapshot=(patch={})=>({type:'appointment',docnum:'180DC-1234ABCD',dateStr:'17 October 2026',name:'Milo Member',reg:'25BCE1234',position:'Consultant',team:'Finance',...patch});
async function save(client=admin,{departmentId='finance',data=snapshot(),bytes='%PDF-1.4\nFixture'}={}){
 const res=await client.upload('/api/letters',{metadata:JSON.stringify({departmentId,data}),file:{name:'letter.pdf',type:'application/pdf',data:bytes}});assert.equal(res.status,200,res.text);return res.json;
}
const send=(client,id,email='member@example.com',requestId=randomUUID())=>client.post('/api/letters/'+id+'/send',{recipientEmail:email,requestId});
const drain=()=>admin.post('/api/dev/drain-email');
const mail=async()=>(await admin.get('/api/dev/outbox')).json.messages;

test('letter studio needs current Google membership and explicit permissions',async()=>{
 assert.equal((await visitor.get('/api/letters')).status,401);assert.equal((await member.get('/api/letters')).status,403);
 assert.equal((await visitor.post('/api/letters')).status,401);assert.equal((await member.get('/api/letters/recipients')).status,403);
 const people=(await finance.get('/api/letters/recipients')).json;assert.ok(people.some(p=>p.email==='member@example.com'));assert.ok(!people.some(p=>p.email==='marketing.director@example.com'));
});

test('saved PDFs and snapshots are immutable, scoped and excluded from public shared files',async()=>{
 const doc=await save(finance);assert.equal((await finance.get('/api/letters/'+doc.id)).json.snapshot.name,'Milo Member');
 assert.equal((await marketing.get('/api/letters/'+doc.id)).status,404);assert.equal((await marketing.get('/api/letters')).json.length,0);
 assert.equal((await visitor.get('/api/letters/'+doc.id+'/file')).status,401);
 const file=await finance.get('/api/letters/'+doc.id+'/file');assert.equal(file.status,200);assert.match(file.headers.get('cache-control'),/no-store/);assert.equal(file.headers.get('content-type'),'application/pdf');assert.ok(file.text.startsWith('%PDF-'));
 const files=await admin.get('/api/club-files');assert.ok(!JSON.stringify(files.json).includes(doc.filename));
 assert.equal((await finance.patch('/api/letters/'+doc.id,{data:snapshot({name:'Changed'})})).status,404);
});

test('department scopes cannot be bypassed by changing free-text team metadata',async()=>{
 const form={metadata:JSON.stringify({departmentId:'marketing',data:snapshot({team:'Finance'})}),file:{name:'a.pdf',data:'%PDF-1.4'}};
 assert.equal((await finance.upload('/api/letters',form)).status,403);
 assert.equal((await finance.upload('/api/letters',{...form,metadata:JSON.stringify({departmentId:null,data:snapshot()})})).status,403);
 const club=await save(admin,{departmentId:null});assert.equal((await finance.get('/api/letters/'+club.id)).status,404);
});

test('all 13 document types are accepted while malformed metadata or non-PDF bytes are rejected',async()=>{
 const types=['appointment','promotion','termination','transfer','resignation','showcause','service','relieving','recognition','mou','announcement','department-report','ldi'];
 for(const type of types)await save(admin,{data:snapshot({type})});assert.equal((await admin.get('/api/letters')).json.length,13);
 assert.equal((await admin.upload('/api/letters',{metadata:'bad',file:{name:'a.pdf',data:'%PDF-1.4'}})).status,400);
 assert.equal((await admin.upload('/api/letters',{metadata:JSON.stringify({departmentId:null,data:snapshot({type:'not-a-letter'})}),file:{name:'a.pdf',data:'%PDF-1.4'}})).status,400);
 assert.equal((await admin.upload('/api/letters',{metadata:JSON.stringify({departmentId:null,data:snapshot()}),file:{name:'a.pdf',data:'<html>fake</html>'}})).status,400);
});

test('a queued letter records no acceptance until the real drain attaches the private PDF',async()=>{
 const doc=await save(finance,{data:snapshot({name:'<script>Member</script>'})});const res=await send(finance,doc.id);assert.equal(res.status,200,res.text);
 let record=portal.db.prepare('SELECT * FROM letter_sends WHERE id=?').get(res.json.id);assert.equal(record.status,'queued');assert.equal(record.accepted_at,null);
 assert.equal((await drain()).status,200);const sent=(await mail())[0];assert.equal(sent.recipient,'member@example.com');assert.deepEqual(sent.attachments,[doc.filename]);
 assert.ok(sent.html.includes('&lt;script&gt;'));assert.ok(!sent.html.includes('<script>'));assert.equal(sent.headers['Reply-To'],'finance.director@example.com');
 record=portal.db.prepare('SELECT * FROM letter_sends WHERE id=?').get(res.json.id);assert.equal(record.status,'accepted');assert.ok(record.accepted_at);
 await drain();assert.equal((await mail()).length,1);
});

test('scoped senders can only address permitted active members, while global senders may address external recipients',async()=>{
 const doc=await save(finance);assert.equal((await send(finance,doc.id,'marketing.director@example.com')).status,403);assert.equal((await send(finance,doc.id,'outside@example.org')).status,403);
 assert.equal((await send(admin,doc.id,'outside@example.org')).status,200);
 const found=portal.db.prepare("SELECT id FROM people WHERE email='member@example.com'").get();portal.db.prepare("UPDATE people SET status='alumni' WHERE id=?").run(found.id);
 try{assert.equal((await send(finance,doc.id)).status,403)}finally{portal.db.prepare("UPDATE people SET status='active' WHERE id=?").run(found.id)}
});

test('concurrent identical requests create one send and one campaign; reuse for another target conflicts',async()=>{
 const doc=await save();const request=randomUUID();const results=await Promise.all([1,2,3].map(()=>send(admin,doc.id,'outside@example.org',request)));
 assert.ok(results.every(r=>r.status===200),results.map(r=>r.text).join(' '));assert.equal(new Set(results.map(r=>r.json.id)).size,1);
 assert.equal(portal.db.prepare('SELECT count(*) AS n FROM letter_sends').get().n,1);assert.equal(portal.db.prepare("SELECT count(*) AS n FROM email_queue WHERE kind='letter'").get().n,1);
 assert.equal((await send(admin,doc.id,'another@example.org',request)).status,409);
});

test('send intent and campaign creation roll back together on a database error',async()=>{
 const doc=await save();portal.db.exec("CREATE TRIGGER reject_letter_campaign BEFORE INSERT ON email_queue WHEN NEW.kind='letter' BEGIN SELECT RAISE(ABORT,'injected'); END;");
 try{assert.equal((await send(admin,doc.id)).status,500)}finally{portal.db.exec('DROP TRIGGER reject_letter_campaign;')}
 assert.equal(portal.db.prepare('SELECT count(*) AS n FROM letter_sends').get().n,0);assert.equal(portal.db.prepare("SELECT count(*) AS n FROM email_queue WHERE kind='letter'").get().n,0);
});

test('oversized but downloadable PDFs cannot exceed the separate email attachment budget',async()=>{
 const data=Buffer.alloc(3*1024*1024+1,32);data.write('%PDF-1.4');const doc=await save(admin,{bytes:data});assert.equal(doc.emailEligible,false);
 const result=await send(admin,doc.id);assert.equal(result.status,400);assert.equal(result.text,'letter_too_large_for_email');assert.equal((await admin.get('/api/letters/'+doc.id+'/file')).status,200);
});

test('provider-unknown results stay uncertain and are not automatically resent',async()=>{
 const doc=await save();const res=await send(admin,doc.id,'operator@unknown.invalid');assert.equal(res.status,200);await drain();
 assert.equal(portal.db.prepare('SELECT status FROM letter_sends WHERE id=?').get(res.json.id).status,'uncertain');await drain();
 assert.equal(portal.db.prepare('SELECT attempts FROM email_deliveries WHERE campaign_id=?').get(res.json.campaignId).attempts,1);
});

test('letter history survives generic campaign retention cleanup',async()=>{
 const doc=await save();const queued=await send(admin,doc.id);await drain();
 portal.db.prepare("UPDATE email_queue SET finished_at='2000-01-01T00:00:00Z' WHERE id=?").run(queued.json.campaignId);await drain();
 assert.equal(portal.db.prepare('SELECT id FROM email_queue WHERE id=?').get(queued.json.campaignId),undefined);
 const detail=(await admin.get('/api/letters/'+doc.id)).json;assert.equal(detail.sends.length,1);assert.equal(detail.sends[0].status,'accepted');
});

test('letter send and save limits have their own persistent buckets',async()=>{
 const doc=await save();assert.equal((await send(admin,doc.id)).status,200);portal.db.prepare("UPDATE rate_limits SET count=30 WHERE endpoint='letter_send'").run();
 assert.equal((await send(admin,doc.id)).status,429);
 assert.equal((await admin.get('/api/letters')).status,200);
});
