import { type FormEvent, useState } from 'react';
import { Button, ProblemAlert, SelectField, TextAreaField, TextField } from '../../components/ui.tsx';
import { api, problemFrom } from '../../lib/api.ts';
import type { ApiProblem } from '../../lib/errors.ts';
import type { Department, PersonDetail, ProfilePatch } from '../../lib/types.ts';

const emptyToNull = (value: string) => (value.trim() === '' ? null : value.trim());

export function ProfileForm({
  person,
  departments,
  canMove,
  onCancel,
  onSaved,
}: {
  person: PersonDetail;
  departments: Department[] | undefined;
  canMove: boolean;
  onCancel: () => void;
  onSaved: (next: PersonDetail) => void;
}) {
  const [form, setForm] = useState({
    fullName: person.fullName,
    phone: person.phone ?? '',
    regNo: person.regNo ?? '',
    year: person.year ? String(person.year) : '',
    branch: person.branch ?? '',
    linkedinUrl: person.linkedinUrl ?? '',
    githubUrl: person.githubUrl ?? '',
    photoKey: person.photoKey ?? '',
    skills: (person.skills ?? []).join(', '),
    bio: person.bio ?? '',
    departmentId: person.departmentId ?? '',
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    const body: ProfilePatch = {
      fullName: form.fullName.trim(),
      phone: emptyToNull(form.phone),
      regNo: emptyToNull(form.regNo),
      year: form.year ? Number(form.year) : null,
      branch: emptyToNull(form.branch),
      linkedinUrl: emptyToNull(form.linkedinUrl),
      githubUrl: emptyToNull(form.githubUrl),
      photoKey: emptyToNull(form.photoKey),
      bio: emptyToNull(form.bio),
      skills: form.skills
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    };
    if (canMove && (form.departmentId || null) !== person.departmentId) body.departmentId = form.departmentId || null;
    try {
      const next = await api('/api/people/:id', { method: 'PATCH', params: { id: person.id }, body });
      onSaved({ ...person, ...next, tenures: person.tenures, grants: person.grants });
    } catch (err) {
      setProblem(problemFrom(err));
      setBusy(false);
    }
  };

  const err = (field: string) => problem?.fields[field];
  const shown = ['fullName', 'phone', 'regNo', 'year', 'branch', 'linkedinUrl', 'githubUrl', 'photoKey', 'skills', 'bio', 'departmentId'];
  return (
    <form className="form" onSubmit={submit} noValidate>
      <div className="form-grid">
        <TextField label="Full name" value={form.fullName} onChange={set('fullName')} error={err('fullName')} required autoComplete="name" />
        <TextField label="Phone" value={form.phone} onChange={set('phone')} error={err('phone')} optional type="tel" autoComplete="tel" />
        <TextField label="Registration no." value={form.regNo} onChange={set('regNo')} error={err('regNo')} optional />
        <SelectField label="Year" value={form.year} onChange={set('year')} error={err('year')} optional>
          <option value="">Not set</option>
          {[1, 2, 3, 4, 5, 6].map((y) => (
            <option key={y} value={y}>
              Year {y}
            </option>
          ))}
        </SelectField>
        <TextField label="Branch" value={form.branch} onChange={set('branch')} error={err('branch')} optional placeholder="e.g. CSE" />
        {canMove && (
          <SelectField label="Department" value={form.departmentId} onChange={set('departmentId')} error={err('departmentId')}>
            <option value="">Club-wide</option>
            {departments?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </SelectField>
        )}
        <TextField
          label="LinkedIn"
          value={form.linkedinUrl}
          onChange={set('linkedinUrl')}
          error={err('linkedinUrl')}
          optional
          type="url"
          placeholder="https://www.linkedin.com/in/…"
        />
        <TextField label="GitHub" value={form.githubUrl} onChange={set('githubUrl')} error={err('githubUrl')} optional type="url" placeholder="https://github.com/…" />
        <TextField
          label="Photo link"
          hint="An https:// link to a square photo."
          value={form.photoKey}
          onChange={set('photoKey')}
          error={err('photoKey')}
          optional
          type="url"
        />
        <TextField label="Skills" hint="Separate with commas." value={form.skills} onChange={set('skills')} error={err('skills')} optional />
      </div>
      <TextAreaField label="About" value={form.bio} onChange={set('bio')} error={err('bio')} optional rows={4} maxLength={1000} />
      <ProblemAlert problem={problem} fieldsShown={shown} />
      <div className="form-actions">
        <Button variant="ghost" onClick={onCancel} disabled={busy}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          Save profile
        </Button>
      </div>
    </form>
  );
}
