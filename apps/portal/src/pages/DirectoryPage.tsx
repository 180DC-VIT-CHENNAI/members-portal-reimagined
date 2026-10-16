import { useEffect, useState } from 'react';
import { Icon } from '../components/icons.tsx';
import { Avatar, EmptyState, ErrorState, LoadingBlock, PageHeader, SearchField, SelectField, StatusBadge, cx } from '../components/ui.tsx';
import { api, lookups, useLoad } from '../lib/api.ts';
import { isStatus, lookupName, plural, STATUS_LABEL, STATUS_ORDER } from '../lib/format.ts';
import { Link, setQuery, useLocation } from '../lib/router.tsx';
import { useSession } from '../lib/session.tsx';
import type { Department, Position, RolesResponse, Term } from '../lib/types.ts';

const FILTERS = ['status', 'department', 'role', 'position', 'term'] as const;

export function DirectoryPage() {
  const { can } = useSession();
  const { query } = useLocation();
  const q = query.get('q') ?? '';
  const [search, setSearch] = useState(q);
  const filters = Object.fromEntries(FILTERS.map((key) => [key, query.get(key) ?? ''])) as Record<(typeof FILTERS)[number], string>;

  // Debounce typing into the URL so every keystroke isn't a request.
  useEffect(() => {
    if (search === q) return;
    const timer = setTimeout(() => setQuery({ q: search.trim() || null }), 250);
    return () => clearTimeout(timer);
  }, [search, q]);

  const people = useLoad(() => {
    const params: Record<string, string> = {};
    if (q) params.q = q;
    for (const key of FILTERS) if (filters[key]) params[key] = filters[key];
    if (params.status && !isStatus(params.status)) delete params.status;
    return api('/api/people', { query: params as never });
  }, [q, ...FILTERS.map((key) => filters[key])]);

  const [departments, setDepartments] = useState<Department[]>();
  const [positions, setPositions] = useState<Position[]>();
  const [terms, setTerms] = useState<Term[]>();
  const [roles, setRoles] = useState<RolesResponse['roles']>();
  useEffect(() => {
    void lookups.departments().then(setDepartments, () => {});
    void lookups.positions().then(setPositions, () => {});
    void lookups.terms().then(setTerms, () => {});
    void lookups.roles().then((r) => setRoles(r.roles), () => {});
  }, []);

  const active = FILTERS.some((key) => filters[key]) || q;
  const deptName = (id: string | null) => lookupName(departments, id, (d) => d.name);

  return (
    <div className="page">
      <PageHeader
        overline="People"
        title="Directory"
        lede="Everyone in the club, past and present."
        actions={
          can('people.export') && (
            <a className="btn btn-secondary" href="/api/exports/people" download>
              <Icon name="download" size={18} />
              Export CSV
            </a>
          )
        }
      />
      <div className="card">
        <div className="card-inner flush">
          <form className="filters" role="search" onSubmit={(e) => e.preventDefault()}>
            <SearchField
              className="field-search"
              label="Search"
              placeholder="Name, email or skill"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <SelectField label="Status" value={filters.status} onChange={(e) => setQuery({ status: e.target.value })}>
              <option value="">Any status</option>
              {STATUS_ORDER.map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABEL[s]}
                </option>
              ))}
            </SelectField>
            <SelectField label="Department" value={filters.department} onChange={(e) => setQuery({ department: e.target.value })}>
              <option value="">All departments</option>
              {departments?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Access role" value={filters.role} onChange={(e) => setQuery({ role: e.target.value })}>
              <option value="">Any role</option>
              {roles?.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}
                </option>
              ))}
            </SelectField>
            <SelectField label="Position" value={filters.position} onChange={(e) => setQuery({ position: e.target.value })}>
              <option value="">Any position</option>
              {positions?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                  {p.departmentId ? ` (${deptName(p.departmentId)})` : ''}
                </option>
              ))}
            </SelectField>
            <SelectField label="Term" value={filters.term} onChange={(e) => setQuery({ term: e.target.value })}>
              <option value="">Any term</option>
              {terms?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </SelectField>
          </form>
          <p className="result-meta" aria-live="polite">
            {people.data ? plural(people.data.length, 'person', 'people') : ''}
            {active && (
              <button
                type="button"
                className="text-link"
                onClick={() => {
                  setSearch('');
                  setQuery(Object.fromEntries([['q', null], ...FILTERS.map((key) => [key, null])]));
                }}
              >
                Clear filters
              </button>
            )}
          </p>
          {people.problem ? (
            <ErrorState problem={people.problem} onRetry={people.reload} />
          ) : !people.data ? (
            <LoadingBlock />
          ) : people.data.length === 0 ? (
            <EmptyState title="Nobody matches">Try a different search or clear the filters.</EmptyState>
          ) : (
            <div className={cx('table-wrap', people.loading && 'loading-dim')}>
              <table className="table table-stack">
                <thead>
                  <tr>
                    <th scope="col">Name</th>
                    <th scope="col">Position</th>
                    <th scope="col">Department</th>
                    <th scope="col">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {people.data.map((p) => (
                    <tr key={p.id} className="is-link">
                      <td className="cell-primary">
                        <div className="person-cell">
                          <Avatar name={p.fullName} photo={p.photoKey} />
                          <div className="person-cell-text">
                            <Link to={`/people/${p.id}`} className="row-link">
                              {p.fullName}
                            </Link>
                            <span className="email">{p.email}</span>
                          </div>
                        </div>
                      </td>
                      <td data-label="Position">{p.positions.map((t) => t.title).join(', ') || <span className="muted">None this term</span>}</td>
                      <td data-label="Department">{deptName(p.departmentId) ?? <span className="muted">Club-wide</span>}</td>
                      <td data-label="Status">
                        <StatusBadge status={p.status} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
