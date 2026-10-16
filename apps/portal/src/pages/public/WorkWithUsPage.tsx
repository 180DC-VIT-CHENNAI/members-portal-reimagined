import { type FormEvent, useState } from 'react';
import { Alert, Button, ProblemAlert, TextAreaField, TextField, useTitle } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import type { ConsultingRequestBody } from '../../lib/types.ts';
import { SectionHeader } from './PublicLayout.tsx';

const EMPTY: ConsultingRequestBody = { name: '', email: '', phone: '', organization: '', roleInOrg: '', requirement: '' };

export function WorkWithUsPage() {
  useTitle('Work with us');
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const set = (key: keyof ConsultingRequestBody) => (event: { target: { value: string } }) => setForm({ ...form, [key]: event.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/consulting-request', { method: 'POST', body: { ...form, roleInOrg: form.roleInOrg || null } });
      setSent(true);
      setForm(EMPTY);
    } catch (err) {
      const p = problemFrom(err);
      setProblem(p.status === 429 ? { ...p, message: "You've already sent a request in the last hour. We'll be in touch." } : p);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="site-section site-narrow stack">
      <SectionHeader eyebrow="Work with us" title="Request a consultation">
        Non-profits and social enterprises can ask for free consulting support. Tell us about your organisation and what you need, and the board
        will reply by email.
      </SectionHeader>
      {sent ? (
        <Alert tone="success" title="Request sent">
          Thanks for reaching out. We'll reply to the email you gave us.
        </Alert>
      ) : (
        <div className="card">
          <form className="card-inner form" onSubmit={submit}>
            <div className="form-grid">
              <TextField label="Your name" value={form.name} onChange={set('name')} error={problem?.fields.name} required maxLength={255} autoComplete="name" />
              <TextField label="Email" type="email" value={form.email} onChange={set('email')} error={problem?.fields.email} required autoComplete="email" />
              <TextField label="Phone" type="tel" value={form.phone} onChange={set('phone')} error={problem?.fields.phone} required autoComplete="tel" />
              <TextField label="Organisation" value={form.organization} onChange={set('organization')} error={problem?.fields.organization} required maxLength={255} />
              <TextField label="Your role" optional value={form.roleInOrg ?? ''} onChange={set('roleInOrg')} error={problem?.fields.roleInOrg} maxLength={255} />
            </div>
            <TextAreaField
              label="What do you need help with?"
              value={form.requirement}
              onChange={set('requirement')}
              error={problem?.fields.requirement}
              required
              rows={6}
              maxLength={2000}
            />
            <ProblemAlert problem={problem} fieldsShown={['name', 'email', 'phone', 'organization', 'roleInOrg', 'requirement']} />
            <div className="form-actions">
              <Button type="submit" variant="primary" busy={busy}>
                Send request
              </Button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
