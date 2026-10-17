import { useState } from 'react';
import { upload, problemFrom } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import type { NewsletterAsset } from '../lib/newsletter-client.ts';
import { Button, ProblemAlert, TextField } from './ui.tsx';

export function NewsletterAssetField({ kind, value, onChange }: { readonly kind: 'source' | 'image'; readonly value: NewsletterAsset | null; readonly onChange: (asset: NewsletterAsset | null) => void }) {
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true); setProblem(null);
    const form = new FormData(); form.append('file', file);
    try { onChange(await upload<NewsletterAsset>('/api/newsletter/assets', form)); }
    catch (err) { setProblem(problemFrom(err)); } finally { setBusy(false); }
  };
  return <div className="stack-sm">
    <TextField label={kind === 'image' ? 'Cover / poster image' : 'Source document'} optional type="file" accept={kind === 'image' ? '.jpg,.jpeg,.png,.gif,.webp' : '.pdf,.docx,.jpg,.jpeg,.png,.gif,.webp'} disabled={busy}
      hint={busy ? 'Uploading…' : 'Up to 20 MB. Source documents over 3 MB are linked, not attached to email.'}
      onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; void pick(file); }} />
    {value && <div className="row-between"><span className="caption">{value.filename} · {(value.bytes / 1024 / 1024).toFixed(1)} MB</span><Button size="sm" variant="ghost" disabled={busy} onClick={() => onChange(null)}>Clear</Button></div>}
    <ProblemAlert problem={problem} />
  </div>;
}
