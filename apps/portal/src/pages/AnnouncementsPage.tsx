import { type FormEvent, useState } from 'react';
import { BackLink, Button, Card, EmptyState, ErrorState, LoadingBlock, PageHeader, ProblemAlert, TextAreaField, TextField } from '../components/ui.tsx';
import { api, problemFrom, useLoad } from '../lib/api.ts';
import type { ApiProblem } from '../lib/errors.ts';
import { formatDateTime } from '../lib/format.ts';
import { useSession } from '../lib/session.tsx';

/** Members read announcements here; people with announcements.manage also post and remove them. */
export function AnnouncementsPage({ admin = false }: { admin?: boolean }) {
  const { can } = useSession();
  const manage = can('announcements.manage');
  const list = useLoad(() => api('/api/announcements'), []);
  const [removing, setRemoving] = useState<string | null>(null);
  const [problem, setProblem] = useState<ApiProblem | null>(null);

  const remove = async (id: string) => {
    setRemoving(id);
    setProblem(null);
    try {
      await api('/api/announcements/:id', { method: 'DELETE', params: { id } });
      list.reload();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setRemoving(null);
    }
  };

  return (
    <div className="page page-narrow">
      {admin && <BackLink to="/admin">Admin</BackLink>}
      <PageHeader overline="Club" title="Announcements" lede="Notices for everyone in the club, newest first." />
      {manage && <NewAnnouncement onPosted={list.reload} />}
      <ProblemAlert problem={problem} />
      {list.problem ? (
        <ErrorState problem={list.problem} onRetry={list.reload} />
      ) : !list.data ? (
        <LoadingBlock />
      ) : list.data.length === 0 ? (
        <EmptyState icon="megaphone" title="No announcements yet" />
      ) : (
        <ul className="stack">
          {list.data.map((a) => (
            <li key={a.id}>
              <Card
                title={a.title}
                description={`${a.authorName ?? 'Club'} · ${formatDateTime(a.createdAt)}`}
                actions={
                  manage && (
                    <Button size="sm" variant="danger-quiet" icon="trash" busy={removing === a.id} onClick={() => remove(a.id)}>
                      Remove
                    </Button>
                  )
                }
              >
                <p className="pre-wrap">{a.content}</p>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewAnnouncement({ onPosted }: { onPosted: () => void }) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<ApiProblem | null>(null);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setProblem(null);
    try {
      await api('/api/announcements', { method: 'POST', body: { title, content } });
      setTitle('');
      setContent('');
      onPosted();
    } catch (err) {
      setProblem(problemFrom(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Post an announcement">
      <form className="form" onSubmit={submit}>
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} error={problem?.fields.title} required maxLength={255} />
        <TextAreaField label="Message" value={content} onChange={(e) => setContent(e.target.value)} error={problem?.fields.content} required rows={4} maxLength={2000} />
        <ProblemAlert problem={problem} fieldsShown={['title', 'content']} />
        <div className="form-actions">
          <Button type="submit" variant="primary" icon="megaphone" busy={busy} disabled={!title.trim() || !content.trim()}>
            Post
          </Button>
        </div>
      </form>
    </Card>
  );
}
