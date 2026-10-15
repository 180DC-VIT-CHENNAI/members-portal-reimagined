# Contributing on the `reimagined` branch

The `reimagined` branch is reserved for the **product problem statement**:
[`180DC_Unified_Platform_Problem_Statement.md`](180DC_Unified_Platform_Problem_Statement.md).
Junior consultants work here. All code changes go to `main` instead (see `AGENTS.md`).

## Workflow

1. Create a branch from `reimagined`, named after your change, for example
   `ps/chat-guest-expiry` or `ps/fix-section-5-3-wording`.
   - In the GitHub web editor: open the file on the `reimagined` branch, click the pencil,
     and choose **Create a new branch for this commit and start a pull request**.
2. Edit **only** `180DC_Unified_Platform_Problem_Statement.md`. Do not touch code, configs,
   images or other docs from this branch.
3. Open a pull request **into `reimagined`** (never into `main`, never into the upstream repo).
   - Title: what changed, e.g. `Problem statement: add guest expiry rules to 7.4`.
   - Description: which sections you changed, why, and the source of any new facts.
4. One reviewer approves before merge. Address review comments with new commits on the same branch.
5. Keep pull requests small: one topic or one section at a time.

## How to write in the problem statement

The document defines **problems, expected experiences, rules and acceptance evidence**.
It does not design the solution. Keep to that.

- **Write problems and outcomes, not implementations.** Say "Members must see overdue tasks
  first on their home screen", not "Add a SQL view sorted by due_date".
- **Tag every requirement with a status label** from section 1.2:
  `[B]` baseline (exists today, reverify), `[E]` enhancement, `[N]` new, `[O]` optional,
  `[D]` needs an owner decision. Combine when needed, e.g. `[B+E]`.
- **Use "must" only for acceptance conditions.** "Must" means "required if this feature is
  selected for release". Use "should" for preferences and "may" for options.
- **Make each requirement testable.** State who, what, and how someone checks it.
  Prefer "A director can reassign a task within their department in two clicks" to
  "Task management should be easy".
- **Mark open questions as `[D]`** and name who decides (board, chairperson, technical lead).
  Do not invent policy, budgets, deadlines or approvals.
- **Do not claim something exists unless you checked it** in the live portal or the
  repository docs. If unsure, label it `[E]` or `[D]`, not `[B]`.
- **No private data.** No real member names, emails, phone numbers, tokens, client
  details, or screenshots containing them.
- **Style.** British English (the document is `en-GB`). Plain, short sentences. Active voice.
  Sentence-case headings that keep the existing numbering (`## 5.4 ...`). Tables for
  comparisons; bullet lists for rules. No emojis.
- **Keep the structure.** Add content to the matching section. If you need a new section,
  add it at the end of the right chapter and update any cross-references.
- **Do not edit the front matter** (`title`, `date`, `author` block at the top) unless a
  reviewer asks you to.

## Checking your change

- Preview the Markdown on GitHub before opening the pull request; check tables and lists render.
- Search the document for words you renamed so the terminology stays consistent.
- Re-read the section headings list (sections 1-9) to confirm numbering is intact.

## Using an AI assistant

You may draft with an AI assistant. You are responsible for every sentence you submit:
check facts against the portal and repository docs, keep the status labels honest, and
remove anything the assistant made up. Agents follow `AGENTS.md`; on this branch they
must only edit the problem statement.
