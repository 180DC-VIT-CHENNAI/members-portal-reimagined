import { useLoad } from '../../lib/api.ts';
import { burndownGeometry } from '../../lib/burndown-chart.ts';
import { formatDate } from '../../lib/format.ts';
import { github } from '../../lib/github-client.ts';
import { ErrorState, LoadingBlock } from '../ui.tsx';

export function BurndownChart({ projectId, milestoneId, title }: { projectId: string; milestoneId: number; title: string }) {
  const data = useLoad(() => github.burndown(projectId, milestoneId), [projectId, milestoneId]);
  if (!data.data) {
    return data.problem ? <ErrorState problem={data.problem} onRetry={data.reload} /> : <LoadingBlock rows={2} label="Loading burndown" />;
  }
  const { points, milestone, total } = data.data;
  const last = points[points.length - 1];
  if (!last) return <p className="caption muted">No issues in this milestone yet, so there is nothing to burn down.</p>;

  const chart = burndownGeometry(data.data);
  const summary = `${title}: ${last.open} of ${total} open on ${formatDate(last.date)}${
    last.ideal === null ? '' : `, ideal ${Math.round(last.ideal)}`
  }${milestone.dueOn ? `, due ${formatDate(milestone.dueOn)}` : ', no due date'}.`;

  return (
    <figure className="gh-burndown">
      <svg viewBox={`0 0 ${chart.width} ${chart.height}`} role="img" aria-label={summary} className="gh-burndown-svg">
        {chart.yTicks.map((tick) => (
          <g key={tick.value}>
            <line className="gh-burndown-grid" x1={chart.plot.left} x2={chart.plot.right} y1={tick.y} y2={tick.y} />
            <text className="gh-burndown-label" x={chart.plot.left - 8} y={tick.y} textAnchor="end" dominantBaseline="middle">
              {tick.value}
            </text>
          </g>
        ))}
        {chart.xTicks.map((tick) => (
          <text key={tick.date} className="gh-burndown-label" x={tick.x} y={chart.plot.bottom + 18} textAnchor="middle">
            {formatDate(tick.date)}
          </text>
        ))}
        {chart.ideal && <path className="gh-burndown-ideal" d={chart.ideal} />}
        <path className="gh-burndown-actual" d={chart.actual} />
        <circle className="gh-burndown-dot" cx={chart.last.x} cy={chart.last.y} r={4} />
      </svg>
      <figcaption className="gh-burndown-legend caption muted">
        <span className="gh-burndown-key is-actual">Open items</span>
        {chart.ideal && <span className="gh-burndown-key is-ideal">Ideal to 0 on {formatDate(milestone.dueOn)}</span>}
        <span>
          {last.open} of {total} open on {formatDate(last.date)}
        </span>
      </figcaption>
    </figure>
  );
}
