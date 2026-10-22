import { useEffect, useState } from 'react';
import { Avatar, EmptyState, ErrorState, LoadingBlock, PageHeader, SelectField, useTitle } from '../components/ui.tsx';
import { api, lookups, useLoad } from '../lib/api.ts';
import { lookupName } from '../lib/format.ts';
import { Link, setQuery, useLocation } from '../lib/router.tsx';
import type { Department, Term } from '../lib/types.ts';

type ChartNode = Awaited<ReturnType<typeof loadChart>>['nodes'][number];

const loadChart = (term: string | null) => api('/api/org-chart', { query: term ? { term } : {} });

/** Roots are people who report to no one in this term's chart; everyone else hangs under their manager. */
function buildTree(nodes: readonly ChartNode[]) {
  const holders = new Set(nodes.map((n) => n.personId));
  const children = new Map<string, ChartNode[]>();
  const roots: ChartNode[] = [];
  for (const node of nodes) {
    if (node.reportsToPersonId && holders.has(node.reportsToPersonId) && node.reportsToPersonId !== node.personId) {
      children.set(node.reportsToPersonId, [...(children.get(node.reportsToPersonId) ?? []), node]);
    } else {
      roots.push(node);
    }
  }
  return { roots, children };
}

export function OrgChartPage() {
  useTitle('Org chart');
  const { query } = useLocation();
  const termId = query.get('term');
  const chart = useLoad(() => loadChart(termId), [termId]);
  const [terms, setTerms] = useState<Term[]>();
  const [departments, setDepartments] = useState<Department[]>();
  useEffect(() => {
    void lookups.terms().then(setTerms, () => {});
    void lookups.departments().then(setDepartments, () => {});
  }, []);

  const tree = chart.data ? buildTree(chart.data.nodes) : null;
  const dept = (id: string | null) => lookupName(departments, id, (d) => d.name) ?? 'Club-wide';
  const shown = new Set<string>();
  const renderNode = (node: ChartNode) => {
    // A person holding several positions appears once per position; their reports appear under the first.
    const firstVisit = !shown.has(node.personId);
    shown.add(node.personId);
    const reports = firstVisit ? (tree?.children.get(node.personId) ?? []) : [];
    return (
      <li key={node.tenureId} className="org-node">
        <div className="person-cell">
          <Avatar name={node.fullName} photo={node.photoKey} size={32} />
          <div className="person-cell-text">
            <Link to={`/people/${node.personId}`} className="row-link">{node.fullName}</Link>
            <span className="email">{node.title} · {dept(node.departmentId)}{node.endedOn ? ' (ended)' : ''}</span>
          </div>
        </div>
        {reports.length > 0 && <ul className="org-children">{reports.map(renderNode)}</ul>}
      </li>
    );
  };

  return (
    <div className="page">
      <PageHeader overline="People" title="Org chart" lede="Positions held in a term and who reports to whom. Titles don't grant access." />
      <div className="card">
        <div className="card-inner">
          <div className="filters">
            <SelectField label="Term" value={termId ?? chart.data?.term.id ?? ''} onChange={(e) => setQuery({ term: e.target.value || null })}>
              {terms?.map((t) => <option key={t.id} value={t.id}>{t.label}{t.isCurrent ? ' (current)' : ''}</option>)}
            </SelectField>
          </div>
          {chart.problem ? (
            <ErrorState problem={chart.problem} onRetry={chart.reload} />
          ) : !tree ? (
            <LoadingBlock />
          ) : tree.roots.length === 0 ? (
            <EmptyState icon="users" title="No positions in this term" />
          ) : (
            <ul className="org-tree">{tree.roots.map(renderNode)}</ul>
          )}
        </div>
      </div>
    </div>
  );
}
