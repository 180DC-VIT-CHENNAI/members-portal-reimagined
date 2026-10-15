// Bugs the suite has found but that are not fixed yet. Tests asserting the
// correct behaviour pass `{ todo: KNOWN.X }`: they still run and report, but
// do not fail the run. When a fix lands, delete the entry and the todo, and
// the test then guards against the bug coming back. Details: tests/README.md.
export const KNOWN = {};
