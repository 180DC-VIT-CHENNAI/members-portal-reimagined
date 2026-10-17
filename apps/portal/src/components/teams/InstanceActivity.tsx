import { useLoad } from '../../lib/api.ts';
import { formatDateTime } from '../../lib/format.ts';
import { type ActivityEntry, type Instance, loadInstanceActivity } from '../../lib/team-client.ts';
import { Button, Card, EmptyState, ErrorState, LoadingBlock } from '../ui.tsx';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function text(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === 'string' && value ? value : null;
}

function change(details: Record<string, unknown>, key: string): { from: string; to: string } | null {
  const value = details[key];
  return isRecord(value) && typeof value.from === 'string' && typeof value.to === 'string' ? { from: value.from, to: value.to } : null;
}

const SETTINGS: Record<string, string> = { name: 'name', description: 'description', groupLabel: 'group label', departmentIds: 'departments', levels: 'levels' };

function listOf(values: readonly string[]): string {
  return values.length < 2 ? values.join('') : `${values.slice(0, -1).join(', ')} and ${values[values.length - 1]}`;
}

function teamUpdate(details: Record<string, unknown>): string {
  const team = `"${text(details, 'team') ?? 'a team'}"`;
  const status = change(details, 'status');
  const level = change(details, 'level');
  const at = level ? ` at ${level.to}` : '';
  if (status?.to === 'winner') return `marked ${team} the winner${at}`;
  if (status?.to === 'eliminated') return `eliminated ${team}${at}`;
  if (status?.to === 'active') return `reinstated ${team}${at}`;
  if (level) return `moved ${team} from ${level.from} to ${level.to}`;
  return `edited the team ${team}`;
}

/** One sentence per allow-listed event; details carry names and values, never emails. */
export function describe(entry: ActivityEntry, groupLabel: string): string {
  const details: Record<string, unknown> = isRecord(entry.details) ? entry.details : {};
  const label = groupLabel.toLowerCase();
  const group = `the ${label} "${text(details, 'group') ?? ''}"`;
  const team = `"${text(details, 'team') ?? ''}"`;
  const member = text(details, 'member') ?? 'someone';
  const outsider = text(details, 'name') ?? 'someone';
  switch (entry.action) {
    case 'team_instance.create':
      return 'created this instance';
    case 'team_instance.update': {
      const fields = Array.isArray(details.fields) ? details.fields.flatMap((field) => (typeof field === 'string' ? [SETTINGS[field] ?? field] : [])) : [];
      return fields.length ? `changed the ${listOf(fields)}` : 'changed the settings';
    }
    case 'team_instance.group.create':
      return `added ${group}`;
    case 'team_instance.group.update':
      return `edited ${group}`;
    case 'team_instance.group.delete':
      return `deleted ${group}; its teams stayed`;
    case 'team_instance.team.create':
      return `added the team ${team}`;
    case 'team_instance.team.update':
      return teamUpdate(details);
    case 'team_instance.team.delete':
      return `deleted the team ${team}`;
    case 'team_instance.member.add':
      return `added ${member} to ${team}`;
    case 'team_instance.member.remove':
      return `took ${member} off ${team}`;
    case 'team_instance.member.move':
      return `moved ${member} from "${text(details, 'fromTeam') ?? ''}" to "${text(details, 'toTeam') ?? ''}"`;
    case 'team_instance.external.create':
      return `added ${outsider} to the outside people`;
    case 'team_instance.external.update':
      return `edited the details of ${outsider}`;
    case 'team_instance.external.delete':
      return `removed ${outsider} from the outside people`;
    default:
      return 'made a change';
  }
}

/** The latest 30 changes, loaded when the view opens. */
export function InstanceActivity({ instance }: { readonly instance: Instance }) {
  const feed = useLoad(() => loadInstanceActivity(instance.id), [instance.id]);
  if (feed.problem) return <ErrorState problem={feed.problem} onRetry={feed.reload} />;
  return (
    <Card
      title="Activity"
      description="The latest 30 changes, newest first."
      actions={
        <Button size="sm" icon="history" disabled={feed.loading} onClick={feed.reload}>
          Refresh
        </Button>
      }
    >
      {!feed.data ? (
        <LoadingBlock rows={3} />
      ) : feed.data.length === 0 ? (
        <EmptyState icon="history" title="No changes yet" />
      ) : (
        <ol className="stack activity-list">
          {feed.data.map((entry) => (
            <li key={entry.id} className="stack-sm">
              <p>
                <strong>{entry.actorName}</strong> {describe(entry, instance.groupLabel)}.
              </p>
              <time className="caption muted" dateTime={entry.createdAt}>
                {formatDateTime(entry.createdAt)}
              </time>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
