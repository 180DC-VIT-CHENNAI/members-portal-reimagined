export type ReportingEdges = readonly { readonly personId: string; readonly reportsTo: string | null }[];

/**
 * True when making `personId` report to `managerId` would close a loop in the
 * term's reporting graph (including reporting to oneself).
 */
export function createsCycle(edges: ReportingEdges, personId: string, managerId: string): boolean {
  const seen = new Set<string>();
  const pending = [managerId];
  while (pending.length) {
    const current = pending.pop();
    if (current === personId) return true;
    if (!current || seen.has(current)) continue;
    seen.add(current);
    for (const edge of edges) if (edge.personId === current && edge.reportsTo) pending.push(edge.reportsTo);
  }
  return false;
}
