import { Avatar, EmptyState, ErrorState, LoadingBlock, useTitle } from '../../components/ui.tsx';
import { api, useLoad } from '../../lib/api.ts';
import type { TeamMember } from '../../lib/types.ts';
import { SectionHeader } from './PublicLayout.tsx';

/** Board (club-wide positions) first, then one group per department. */
function groupTeam(members: TeamMember[]): Array<{ name: string; members: TeamMember[] }> {
  const board = members.filter((m) => m.positions.some((p) => p.department === null));
  const groups = new Map<string, TeamMember[]>();
  for (const m of members) {
    if (board.includes(m)) continue;
    const key = m.department ?? 'Club';
    groups.set(key, [...(groups.get(key) ?? []), m]);
  }
  return [
    ...(board.length ? [{ name: 'Board', members: board }] : []),
    ...[...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([name, list]) => ({ name, members: list })),
  ];
}

export function TeamPage() {
  useTitle('Team');
  const team = useLoad(() => api('/api/content/team-members'), []);
  return (
    <div className="site-section stack">
      <SectionHeader eyebrow="Leadership" title="Our team">
        Everyone holding a position in 180DC VIT Chennai this term.
      </SectionHeader>
      {team.problem ? (
        <ErrorState problem={team.problem} onRetry={team.reload} />
      ) : !team.data ? (
        <LoadingBlock />
      ) : team.data.length === 0 ? (
        <EmptyState icon="users" title="The team for this term hasn't been announced yet" />
      ) : (
        groupTeam(team.data).map((group) => (
          <section key={group.name} className="stack-sm" aria-label={group.name}>
            <h3 className="overline">{group.name}</h3>
            <ul className="team-grid">
              {group.members.map((m) => (
                <li key={m.name + m.positions.map((p) => p.title).join()} className="team-card">
                  <Avatar name={m.name} photo={m.photo} size={64} />
                  <div className="team-card-text">
                    <h4>{m.name}</h4>
                    <p className="muted">{m.positions.map((p) => (p.department && p.department !== group.name ? `${p.title}, ${p.department}` : p.title)).join(' · ')}</p>
                    {m.linkedin && (
                      <a className="text-link caption" href={m.linkedin} target="_blank" rel="noopener noreferrer">
                        LinkedIn
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
