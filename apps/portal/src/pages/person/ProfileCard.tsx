import { useState } from 'react';
import { Button, Card, Dialog } from '../../components/ui.tsx';
import { isHttpsUrl } from '../../lib/format.ts';
import { useSession } from '../../lib/session.tsx';
import type { Department, PersonDetail } from '../../lib/types.ts';

import { Icon } from '../../components/icons.tsx';
import { ProfileForm } from './ProfileForm.tsx';
export function ProfileCard({
  person,
  self,
  departments,
  onSaved,
}: {
  person: PersonDetail;
  self: boolean;
  departments: Department[] | undefined;
  onSaved: (next: PersonDetail) => void;
}) {
  const { can } = useSession();
  const [editing, setEditing] = useState(false);
  const canEdit = self || can('people.edit', person.departmentId);
  const privateHidden = person.phone === null && person.regNo === null && !self;

  return (
    <Card
      title="Profile"
      actions={
        canEdit && (
          <Button size="sm" icon="pencil" onClick={() => setEditing(true)}>
            Edit
          </Button>
        )
      }
    >
      <dl className="dl">
        <div>
          <dt>Phone</dt>
          <dd>{person.phone ?? <span className="muted">{privateHidden ? 'Private' : 'Not set'}</span>}</dd>
        </div>
        <div>
          <dt>Registration no.</dt>
          <dd className="mono">{person.regNo ?? <span className="muted">{privateHidden ? 'Private' : 'Not set'}</span>}</dd>
        </div>
        <div>
          <dt>Year</dt>
          <dd>{person.year ?? <span className="muted">Not set</span>}</dd>
        </div>
        <div>
          <dt>Branch</dt>
          <dd>{person.branch ?? <span className="muted">Not set</span>}</dd>
        </div>
        <div>
          <dt>LinkedIn</dt>
          <dd>
            <ExternalLink url={person.linkedinUrl} />
          </dd>
        </div>
        <div>
          <dt>GitHub</dt>
          <dd>
            <ExternalLink url={person.githubUrl} />
          </dd>
        </div>
        <div className="span-all">
          <dt>Skills</dt>
          <dd>
            {person.skills?.length ? (
              <ul className="chips">
                {person.skills.map((s) => (
                  <li key={s} className="chip">
                    {s}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="muted">None listed</span>
            )}
          </dd>
        </div>
        <div className="span-all">
          <dt>About</dt>
          <dd className="prose">{person.bio || <span className="muted">Nothing yet</span>}</dd>
        </div>
      </dl>
      <Dialog open={editing} title={self ? 'Edit your profile' : `Edit ${person.fullName}`} onClose={() => setEditing(false)}>
        {editing && (
          <ProfileForm
            person={person}
            departments={departments}
            canMove={can('people.edit', person.departmentId)}
            onCancel={() => setEditing(false)}
            onSaved={(next) => {
              setEditing(false);
              onSaved(next);
            }}
          />
        )}
      </Dialog>
    </Card>
  );
}

function ExternalLink({ url }: { url: string | null }) {
  if (!isHttpsUrl(url)) return <span className="muted">Not set</span>;
  return (
    <a className="text-link wrap-anywhere" href={url} target="_blank" rel="noopener noreferrer">
      {url.replace(/^https:\/\/(www\.)?/, '')}
      <Icon name="externalLink" size={14} label="opens in a new tab" />
    </a>
  );
}
