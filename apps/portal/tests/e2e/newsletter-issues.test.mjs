import assert from 'node:assert/strict';
import { randomUUID, randomBytes } from 'node:crypto';
import { after, before, beforeEach, test } from 'node:test';
import { anonymous, signIn, startPortal } from './harness.mjs';
let portal, admin, writer, other, director, advisory, visitor;
let writerId;
const base = '/api/newsletter/issues';
const body = (patch = {}) => ({ title: 'Impact in action', content: 'First paragraph.\n\nSecond paragraph.', format: 'text', ...patch });
before(async () => {
  portal = await startPortal({ EMAIL_TEST_MODE: 'capture' });
  admin = signIn(portal, 'srijan.guchhait@gmail.com');
  for (const [email, role] of [['writer@example.com','member'], ['other@example.com','member'], ['director@example.com','director'], ['advisor@example.com','advisory']]) {
    const r = await admin.post('/api/people', { email, fullName: email.split('@')[0], departmentId: 'finance', accessRoleId: role });
    assert.equal(r.status, 201, r.text);
    if (email === 'writer@example.com') writerId = r.json.id;
  }
  writer = signIn(portal, 'writer@example.com'); other = signIn(portal, 'other@example.com'); director = signIn(portal, 'director@example.com'); advisory = signIn(portal, 'advisor@example.com'); visitor = anonymous(portal);
});
after(async () => { await portal?.stop(); });
beforeEach(() => { portal.db.exec('DELETE FROM newsletters; DELETE FROM newsletter_assets; DELETE FROM newsletter_subscribers; DELETE FROM email_deliveries; DELETE FROM email_queue; DELETE FROM dev_outbox; DELETE FROM rate_limits; DELETE FROM email_hour_count;'); });
async function create(client = writer, patch = {}) { const r = await client.post(base, body(patch)); assert.equal(r.status, 201, r.text); return r.json.id; }
const issue = (id) => portal.db.prepare('SELECT * FROM newsletters WHERE id = ?').get(id);
const mails = async () => (await admin.get('/api/dev/outbox')).json.messages;
async function active(email, status = 'active') {
  const token = randomBytes(24).toString('hex');
  portal.db.prepare('INSERT INTO newsletter_subscribers (id,email,status,unsubscribe_token) VALUES (?,?,?,?)').run(randomUUID(),email,status,token);
  return token;
}
const drain = async () => { const r = await admin.post('/api/dev/drain-email'); assert.equal(r.status,200,r.text); return r.json; };
async function asset(client = writer, name = 'brief.pdf', data = '%PDF-1.4\nfixture') {
  const r = await client.upload('/api/newsletter/assets', { file: { name, type: 'application/pdf', data } }); assert.equal(r.status,200,r.text); return r.json;
}

test('Google sessions and permissions protect editing while members cannot broadcast', async () => {
  assert.equal((await visitor.get(base)).status,401);
  assert.equal((await advisory.post(base,body())).status,403);
  const id = await create();
  assert.equal((await writer.post(base+'/'+id+'/send')).status,403);
  assert.equal((await director.post('/api/newsletter/events',{ mode:'test', subject:'Event', description:'Details' })).status,200);
});

test('draft ownership and shared collaboration are enforced for editing and sending', async () => {
  const id = await create();
  assert.equal((await other.get(base+'/'+id)).status,404);
  assert.equal((await other.patch(base+'/'+id,body({ version:1 }))).status,404);
  assert.equal((await other.post(base+'/'+id+'/test')).status,404);
  assert.equal((await writer.patch(base+'/'+id,body({ version:1, shared:true }))).status,200);
  assert.equal((await other.get(base+'/'+id)).status,200);
  assert.equal((await other.patch(base+'/'+id,body({ version:2, shared:true, title:'Collaborated' }))).status,200);
  assert.equal((await other.del(base+'/'+id)).status,403);
});

test('simultaneous issue creation receives unique stable atomic numbers', async () => {
  const ids = await Promise.all([1,2,3].map(() => create()));
  const rows = (await writer.get(base)).json;
  assert.equal(new Set(rows.map((r) => r.slug)).size,3);
  const before = rows.find((r) => r.id===ids[0]).slug;
  await writer.patch(base+'/'+ids[0],body({ version:1,title:'Updated' }));
  assert.equal((await writer.get(base+'/'+ids[0])).json.slug,before);
});

test('article format, sanitization, boundaries and stale-version protection apply on every edit', async () => {
  const id = await create(writer, { format:'html', content:'<p>Safe <strong>body</strong></p><script>alert(1)</script><a href="javascript:evil()" onclick="x()">link</a>' });
  const saved = (await writer.get(base+'/'+id)).json;
  assert.ok(saved.content.includes('<strong>body</strong>'));
  assert.ok(!/script|javascript|onclick/.test(saved.content));
  assert.equal((await writer.patch(base+'/'+id,body({version:1}))).status,200);
  assert.equal((await writer.patch(base+'/'+id,body({version:1,title:'Stale'}))).status,409);
  assert.equal((await writer.post(base,body({title:'x'.repeat(256)}))).status,400);
  assert.equal((await writer.post(base,body({content:'x'.repeat(50001)}))).status,400);
});

test('public listing and detail do not expose drafts, even by UUID', async () => {
  const id = await create();
  assert.deepEqual((await visitor.get('/api/newsletter')).json,[]);
  assert.equal((await visitor.get('/api/newsletter/'+id)).status,404);
  assert.equal((await visitor.get('/api/newsletter/issue-01')).status,404);
});

test('a self-test reaches only the signed-in editor, carries the uploaded attachment and never publishes', async () => {
  const source = await asset();
  const id = await create(writer,{sourceAssetId:source.id});
  const sent = await writer.post(base+'/'+id+'/test',{ testEmail:'invalid-no-broadcast' });
  assert.equal(sent.status,200,sent.text);
  await drain();
  const messages = await mails();
  assert.deepEqual(messages.map((m) => m.recipient),['writer@example.com']);
  assert.deepEqual(messages[0].attachments,['brief.pdf']);
  assert.ok(!messages[0].html.includes('%%UNSUBSCRIBE_URL%%'));
  assert.equal(issue(id).sent_at,null);
  assert.deepEqual((await visitor.get('/api/newsletter')).json,[]);
});

test('broadcasts are single-claimed, separately enveloped, personalized and publish only after acceptance', async () => {
  const a = await active('reader.a@example.com'), b = await active('reader.b@example.com');
  await active('pending@example.com','pending');
  const id = await create(admin);
  const [first, second] = await Promise.all([admin.post(base+'/'+id+'/send'),admin.post(base+'/'+id+'/send')]);
  assert.deepEqual([first.status,second.status].sort(),[200,409]);
  assert.equal(issue(id).sent_at,null);
  assert.equal((await admin.patch(base+'/'+id,body({version:1}))).status,409);
  assert.equal((await admin.del(base+'/'+id)).status,409);
  await drain();
  const messages = await mails();
  assert.deepEqual(messages.map((m) => m.recipient).sort(),['reader.a@example.com','reader.b@example.com']);
  for (const [email, token, others] of [['reader.a@example.com',a,b],['reader.b@example.com',b,a]]) {
    const m = messages.find((m) => m.recipient===email);
    assert.ok(m.html.includes('/unsubscribe/'+token)); assert.ok(!m.html.includes(others));
    assert.equal(m.headers['List-Unsubscribe'],`<${portal.base}/api/newsletter/unsubscribe/${token}>`);
    assert.equal(m.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
  }
  const published = issue(id);
  assert.ok(published.sent_at); assert.equal(published.recipient_count,2); assert.equal(published.broadcast_id,null);
  const article = await visitor.get('/api/newsletter/'+id);
  assert.equal(article.status,200); assert.equal(article.json.title,'Impact in action');
  assert.equal((await admin.post(base+'/'+id+'/send')).status,409);
  await drain(); assert.equal((await mails()).length,2);
});

test('a late unsubscribe or erasure is skipped before sending and never retried as a delivery', async () => {
  const token = await active('leaving@example.com'); await active('erased@example.com'); await active('staying@example.com');
  const id=await create(admin); const sent = await admin.post(base+'/'+id+'/send'); assert.equal(sent.status,200);
  await visitor.post('/api/newsletter/unsubscribe/'+token);
  portal.db.prepare("DELETE FROM newsletter_subscribers WHERE email = 'erased@example.com'").run();
  await drain(); assert.deepEqual((await mails()).map((m)=>m.recipient),['staying@example.com']);
  const deliveries = portal.db.prepare('SELECT recipient,status FROM email_deliveries WHERE campaign_id = ?').all(sent.json.campaignId);
  assert.equal(deliveries.filter((d)=>d.status==='skipped').length,2);
  assert.equal(issue(id).recipient_count,1);
});

test('a zero-acceptance broadcast does not become a public issue', async () => {
  await active('failed@unverified.invalid');
  const id=await create(admin); assert.equal((await admin.post(base+'/'+id+'/send')).status,200);
  await drain(); assert.equal(issue(id).sent_at,null); assert.equal(issue(id).broadcast_id,null);
  assert.deepEqual((await visitor.get('/api/newsletter')).json,[]);
});

test('source uploads validate bytes, ownership and image type; large sources are linked instead of attached', async () => {
  assert.equal((await writer.upload('/api/newsletter/assets',{file:{name:'bad.pdf',data:'not PDF'}})).status,400);
  assert.equal((await writer.upload('/api/newsletter/assets',{file:{name:'bad.exe',data:'MZ'}})).status,400);
  const source=await asset();
  assert.equal((await other.post(base,body({sourceAssetId:source.id}))).status,403);
  assert.equal((await writer.post(base,body({imageAssetId:source.id}))).status,400);
  portal.db.prepare('UPDATE newsletter_assets SET bytes = ? WHERE id = ?').run(3*1024*1024+1,source.id);
  const id=await create(writer,{sourceAssetId:source.id}); await writer.post(base+'/'+id+'/test'); await drain();
  const mail=(await mails())[0]; assert.deepEqual(mail.attachments,[]); assert.ok(mail.html.includes(source.url));
});

test('missing required attachments fail without silently sending an incomplete issue', async () => {
  const source=await asset(admin); const id=await create(admin,{sourceAssetId:source.id}); await active('reader@example.com');
  const queued=await admin.post(base+'/'+id+'/send');
  const key=portal.db.prepare('SELECT key FROM newsletter_assets WHERE id = ?').get(source.id).key;
  assert.equal((await admin.del('/api/case-studies/delete-image',{key})).status,204);
  await drain(); assert.equal((await mails()).length,0);
  assert.equal(portal.db.prepare('SELECT status,last_error FROM email_queue WHERE id = ?').get(queued.json.campaignId).last_error,'required_attachment_missing');
  assert.equal(issue(id).sent_at,null);
});

test('events require explicit mode, self-tests never broadcast, and descriptions remain inert', async () => {
  await active('reader@example.com');
  assert.equal((await writer.post('/api/newsletter/events',{subject:'Event',description:'Details',testEmail:'bad'})).status,400);
  assert.equal((await writer.post('/api/newsletter/events',{mode:'broadcast',subject:'Event',description:'Details'})).status,403);
  const sent=await writer.post('/api/newsletter/events',{mode:'test',subject:'Meet <b>us</b>',description:'<script>alert(1)</script>'}); assert.equal(sent.status,200,sent.text);
  await drain(); const mail=(await mails())[0]; assert.equal(mail.recipient,'writer@example.com'); assert.ok(mail.html.includes('&lt;script&gt;')); assert.ok(!mail.html.includes('<script>'));
});

test('event broadcasts use the subscriber audience and their own per-recipient unsubscribe headers', async () => {
  const token=await active('reader@example.com');
  const event=await director.post('/api/newsletter/events',{mode:'broadcast',subject:'Impact evening',description:'Join us on campus.'}); assert.equal(event.status,200,event.text);
  await drain(); const mail=(await mails())[0]; assert.equal(mail.recipient,'reader@example.com'); assert.ok(mail.html.includes(token)); assert.equal(mail.headers['List-Unsubscribe-Post'],'List-Unsubscribe=One-Click');
});

test('an editor loses access on the next request when their membership ends', async () => {
  const id=await create();
  assert.equal((await admin.post('/api/people/'+writerId+'/status',{status:'alumni'})).status,200);
  try { assert.equal((await writer.get(base+'/'+id)).status,401); }
  finally { portal.db.prepare("UPDATE people SET status='active' WHERE id=?").run(writerId); }
});
