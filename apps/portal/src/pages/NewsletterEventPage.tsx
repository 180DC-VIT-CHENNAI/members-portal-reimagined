import { useState } from 'react';
import { NewsletterAssetField } from '../components/NewsletterAssetField.tsx';
import { Alert, BackLink, Button, Card, ConfirmDialog, PageHeader, ProblemAlert, TextAreaField, TextField } from '../components/ui.tsx';
import { api, problemFrom } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import type { NewsletterAsset } from '../lib/newsletter-client.ts';
import { useSession } from '../lib/session.tsx';

export function NewsletterEventPage() {
  const { can, me } = useSession();
  const [subject, setSubject] = useState(''), [description, setDescription] = useState('');
  const [source, setSource] = useState<NewsletterAsset | null>(null), [image, setImage] = useState<NewsletterAsset | null>(null);
  const [busy, setBusy] = useState(false), [confirm, setConfirm] = useState(false);
  const [notice, setNotice] = useState(''), [problem, setProblem] = useState<ApiProblem | null>(null);
  const send = async (mode: 'test' | 'broadcast') => {
    setBusy(true); setProblem(null); setNotice('');
    try { const result = await api('/api/newsletter/events', { method: 'POST', body: { mode, subject, description, sourceAssetId: source?.id ?? null, imageAssetId: image?.id ?? null } });
      setNotice(mode === 'test' ? `Test queued to ${me.email}.` : `Event queued to ${result.queued} confirmed readers.`); setConfirm(false);
    } catch (err) { setProblem(problemFrom(err)); } finally { setBusy(false); }
  };
  const ready = Boolean(subject.trim() && description.trim());
  return <div className="page page-narrow"><BackLink to="/newsletter-editor">Newsletter editor</BackLink><PageHeader overline="The Catalyst" title="Event email" lede="An announcement to the same confirmed readers. Test it before broadcasting." />
    <div className="stack">{notice && <Alert tone="success">{notice}</Alert>}<Card><form className="form" onSubmit={(e) => { e.preventDefault(); void send('test'); }}>
      <TextField label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} error={problem?.fields.subject} required maxLength={255} />
      <TextAreaField label="Description" value={description} onChange={(e) => setDescription(e.target.value)} error={problem?.fields.description} required rows={7} maxLength={4000} />
      <NewsletterAssetField kind="image" value={image} onChange={setImage} /><NewsletterAssetField kind="source" value={source} onChange={setSource} />
      <ProblemAlert problem={confirm ? null : problem} fieldsShown={['subject', 'description']} />
      <div className="form-actions"><Button type="submit" busy={busy} disabled={!ready}>Test to me</Button>{can('newsletter.send', null) && <Button variant="primary" disabled={!ready || busy} onClick={() => { setProblem(null); setConfirm(true); }}>Broadcast event</Button>}</div>
    </form></Card></div>
    <ConfirmDialog open={confirm} title="Broadcast this event?" confirmLabel="Queue event" busy={busy} problem={problem} onConfirm={() => void send('broadcast')} onClose={() => setConfirm(false)}><p>"{subject}" will be queued for every confirmed subscriber. This cannot be recalled.</p></ConfirmDialog>
  </div>;
}
