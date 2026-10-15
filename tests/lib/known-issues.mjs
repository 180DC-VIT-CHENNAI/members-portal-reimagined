// Bugs the suite has found but that are not fixed yet. Tests asserting the
// correct behaviour pass `{ todo: KNOWN.X }`: they still run and report, but
// do not fail the run. When a fix lands, delete the entry and the todo, and
// the test then guards against the bug coming back. Details: tests/README.md.
export const KNOWN = {
  DEPT_ACCESS:
    "KNOWN-1: canAccessDept() is async but never awaited, so department routes skip their access check",
  DOCX_IMPORT:
    "KNOWN-2: the pnpm override @xmldom/xmldom >=0.8.15 installs 0.9.x, which mammoth can't use, so DOCX import fails",
  DRAFT_OWNERSHIP:
    "KNOWN-4: POST /api/newsletter-editor/drafts updates any newsletter by id, so one editor can overwrite another's draft",
  NEWSLETTER_ADMIN_ROUTE:
    "KNOWN-5: GET /api/newsletter/admin is shadowed by GET /api/newsletter/:id (registered first), so it returns 404",
  MAINTENANCE_CACHE:
    "KNOWN-3: toggling maintenance mode doesn't clear the 60 s cache, so it takes up to a minute to apply",
};
