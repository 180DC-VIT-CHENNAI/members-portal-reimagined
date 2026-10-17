import { type FormEvent, useState } from 'react';
import { NewsletterAssetField } from '../components/NewsletterAssetField.tsx';
import { Alert, BackLink, Button, Card, ErrorState, LoadingBlock, PageHeader, ProblemAlert, SelectField, TextAreaField, TextField } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { cleanHtml } from '../lib/html.ts';
import { loadIssue, type EditorIssue, type NewsletterAsset } from '../lib/newsletter-client.ts';
import { navigate } from '../lib/router.tsx';

export function NewsletterFormPage({ id }: { readonly id?: string }) {
  const issue = useLoad(() => id ? loadIssue(id) : Promise.resolve(null), [id]);
  if (issue.problem) return <ErrorState problem={issue.problem} onRetry={issue.reload} />;
  if (issue.data === undefined) return <LoadingBlock />;
  return <div className="page page-narrow"><BackLink to="/newsletter-editor">Newsletter editor</BackLink><PageHeader overline="The Catalyst" title={id ? 'Edit issue' : 'New issue'} />
    <IssueForm key={id ?? 'new'} existing={issue.data} />
  </div>;
}
function IssueForm({ existing }: { readonly existing: EditorIssue | null }) {
  const [title, setTitle] = useState(existing?.title ?? '');
  const [subject, setSubject] = useState(existing?.emailSubject ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [content, setContent] = useState(existing?.content ?? '');
  const [format, setFormat] = useState<'text' | 'html'>(existing ? 'html' : 'text');
  const [shared, setShared] = useState(existing?.shared ?? false);
  const [source, setSource] = useState<NewsletterAsset | null>(existing?.assets.source ?? null);
  const [image, setImage] = useState<NewsletterAsset | null>(existing?.assets.image ?? null);
  const [preview, setPreview] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setProblem(null);
    const body = { title, emailSubject: subject.trim() || title, description: description || null, content, format, shared, sourceAssetId: source?.id ?? null, imageAssetId: image?.id ?? null };
    try {
      if (existing) await api('/api/newsletter/issues/:id', { method: 'PATCH', params: { id: existing.id }, body: { ...body, version: existing.version } });
      else await api('/api/newsletter/issues', { method: 'POST', body });
      navigate('/newsletter-editor');
    } catch (err) { setProblem(problemFrom(err)); setBusy(false); }
  };
  return <div className="stack">{existing?.broadcastId && <Alert tone="warning">This issue is queued or sending. Its snapshot cannot be edited until the campaign completes.</Alert>}
    <Card><form className="form" onSubmit={save}>
      <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required maxLength={255} />
      <TextField label="Email subject" optional placeholder="Uses the title if blank" value={subject} onChange={(e) => setSubject(e.target.value)} error={problem?.fields.emailSubject} maxLength={255} />
      <TextAreaField label="Summary" optional value={description} onChange={(e) => setDescription(e.target.value)} error={problem?.fields.description} rows={3} maxLength={1000} />
      <SelectField label="Article format" value={format} onChange={(e) => { const value = e.target.value; if (value === 'text' || value === 'html') setFormat(value); }}><option value="text">Plain text</option><option value="html">Basic HTML</option></SelectField>
      <TextAreaField label="Article" hint="Paragraphs, headings, lists, tables, images and links are allowed. Scripts and styles are removed." value={content} onChange={(e) => setContent(e.target.value)} error={problem?.fields.content} rows={14} maxLength={50000} />
      <NewsletterAssetField kind="source" value={source} onChange={setSource} /><NewsletterAssetField kind="image" value={image} onChange={setImage} />
      <label className="check"><input type="checkbox" checked={shared} onChange={(e) => setShared(e.target.checked)} />Let other editors collaborate on this draft</label>
      <ProblemAlert problem={problem} fieldsShown={['title', 'emailSubject', 'description', 'content']} />
      <div className="form-actions"><Button variant="ghost" onClick={() => setPreview(!preview)}>{preview ? 'Hide preview' : 'Preview article'}</Button><Button variant="ghost" disabled={busy} onClick={() => navigate('/newsletter-editor')}>Cancel</Button><Button type="submit" variant="primary" busy={busy} disabled={!title.trim() || Boolean(existing?.broadcastId)}>Save draft</Button></div>
    </form></Card>
    {preview && <Card title={title || 'Article preview'}>{format === 'text' ? <p className="pre-wrap">{content}</p> : <div className="prose" dangerouslySetInnerHTML={{ __html: cleanHtml(content) }} />}</Card>}
  </div>;
}
