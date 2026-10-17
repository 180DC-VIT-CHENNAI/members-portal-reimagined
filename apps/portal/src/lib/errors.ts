export interface ApiProblem {
  status: number | null;
  code: string;
  message: string;
  fields: Record<string, string>;
}

const STATUS_NAMES: Record<string, string> = {
  invited: 'Invited',
  active: 'Active',
  on_leave: 'On leave',
  alumni: 'Alumni',
  removed: 'Removed',
};

const MESSAGES: Record<string, string> = {
  unauthorized: 'Your session has ended. Sign in again.',
  forbidden: "You don't have permission to do that.",
  not_found: 'That record no longer exists.',
  person_not_found: "This person isn't in the portal.",
  email_already_exists: 'Someone with this email is already in the portal.',
  unknown_department: 'Choose a department from the list.',
  unknown_access_role: 'Choose an access role from the list.',
  unknown_position: 'Choose an active position from the list.',
  unknown_position_or_no_current_term: "That position doesn't exist, or there is no current term yet.",
  unknown_term: 'Choose a term from the list.',
  unknown_permission: "One of the permissions isn't recognised.",
  only_member_role_without_people_grants: 'You can only give the Member role. Other roles need the people.grants permission.',
  forbidden_department: "You can't invite people to that department.",
  no_current_term: 'There is no current term yet. Create and start a term first.',
  nothing_to_update: 'Nothing changed.',
  cannot_change_own_status: "You can't change your own status.",
  cannot_change_own_access: "You can't change your own access.",
  unchanged: 'They already have that status.',
  tenure_exists: 'They already hold that position in that term.',
  tenure_already_ended: 'That position has already ended.',
  tenure_not_found: 'That position record no longer exists.',
  ends_before_start: 'The end date must come after the start date.',
  position_exists: 'A position with this title already exists there.',
  position_not_found: 'That position no longer exists.',
  term_exists: 'A term with this ID already exists.',
  term_not_found: 'That term no longer exists.',
  term_already_current: 'That term is already the current term.',
  'term_id_format_yyyy-yy': 'Use the format 2027-28.',
  invalid_role_id: 'Use 2 to 41 lowercase letters, digits or underscores, starting with a letter.',
  admin_role_is_fixed: 'The Admin role always has every permission.',
  empty_csv: 'The CSV has no rows below the header.',
  invalid_phone: 'Use 6 to 20 digits, spaces, +, ( ) or -.',
  invalid_profile_url: 'Paste the full https:// link to the profile.',
  rate_limited: 'Too many requests. Wait a while and try again.',
  maintenance: 'The portal is under maintenance. Check back later.',
  content_too_short: 'Write at least 10 visible characters.',
  invalid_link: 'Use a full https:// link or a path starting with /.',
  request_not_found: 'That request no longer exists.',
  request_already_processed: 'That request has already been accepted or rejected.',
  case_study_not_found: 'That case study no longer exists.',
  partner_not_found: 'That client no longer exists.',
  announcement_not_found: 'That announcement no longer exists.',
  missing_title_or_content: 'Add a title and a message.',
  file_required: 'Choose a file to upload.',
  empty_file: 'That file is empty.',
  file_too_large: 'That file is too large.',
  unsupported_file_type: "That file type isn't allowed.",
  invalid_category: 'Choose a category from the list.',
  file_not_found: 'That file no longer exists.',
  image_required: 'Choose an image to upload.',
  unsupported_image_type: 'Use a JPEG, PNG, GIF or WebP image.',
  document_required: 'Choose a PDF or Word document.',
  document_empty: "No text could be read from that document.",
  invalid_meet_link: 'Use a meeting link that starts with https:// or http://.',
  invalid_date: 'Enter a real date.',
  project_not_found: "This project doesn't exist, or you can't see it.",
  task_not_found: 'That task no longer exists.',
  member_not_found: 'That person is no longer on this project.',
  task_changed: 'Someone changed this task while you were editing. Close and reopen it to see their changes, or save again to keep yours.',
  assignee_cannot_see_project: "That person can't see this project. Name them on the project first.",
  already_member: 'That person is already on this project.',
  person_without_access: "That person doesn't have access to the portal.",
  nothing_to_change: 'Nothing changed.',
  comment_not_found: 'That comment no longer exists.',
  request_reused: 'This request was already used for another comment. Edit your draft and post again.',
  invalid_cursor: 'That page link is invalid. Refresh to load the latest entries.',
};

export function friendlyIssue(message: string): string {
  if (MESSAGES[message]) return MESSAGES[message];
  if (/^Invalid email/.test(message)) return 'Enter a valid email address.';
  if (/^Invalid URL/.test(message)) return 'Enter a full link starting with https://.';
  if (/^Invalid (ISO )?date/i.test(message)) return 'Enter a valid date.';
  const length = /^Invalid length: Expected (>=|<=)(\d+)/.exec(message);
  if (length) return length[1] === '>=' ? (length[2] === '1' ? 'This field is required.' : `Use at least ${length[2]} characters.`) : `Use at most ${length[2]} characters.`;
  const value = /^Invalid value: Expected (>=|<=)(\d+)/.exec(message);
  if (value) return value[1] === '>=' ? `Use ${value[2]} or more.` : `Use ${value[2]} or less.`;
  if (/^Invalid type/.test(message)) return "This value isn't allowed.";
  return message;
}

export function describeCode(code: string, status: number | null = null): string {
  if (MESSAGES[code]) return MESSAGES[code];
  const rows = /^too_many_rows_max_(\d+)$/.exec(code);
  if (rows) return `The CSV has more than ${rows[1]} rows. Split it into smaller files.`;
  const move = /^cannot_move_([a-z_]+)_to_([a-z_]+)$/.exec(code);
  if (move && STATUS_NAMES[move[1]] && STATUS_NAMES[move[2]]) {
    return `Someone who is ${STATUS_NAMES[move[1]]} can't move to ${STATUS_NAMES[move[2]]}.`;
  }
  if (status === 401) return MESSAGES.unauthorized;
  if (status === 403) return MESSAGES.forbidden;
  if (status === 404) return MESSAGES.not_found;
  if (status === 409) return 'That clashes with an existing record.';
  if (status === 429) return MESSAGES.rate_limited;
  if (status !== null && status >= 500) return 'Something went wrong on the server. Try again in a moment.';
  return code ? friendlyIssue(code) : "The request couldn't be completed. Try again.";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/**
 * Normalise an error thrown by the typed fetch client. Validation failures
 * arrive as JSON `{ error, issues: [{ slot, issues: [{ message, path }] }] }`;
 * every other API error is a plain-text code such as `unknown_department`.
 */
export function toProblem(err: unknown): ApiProblem {
  const status = isRecord(err) && typeof err.status === 'number' ? err.status : null;
  const data = isRecord(err) ? err.data : undefined;
  if (status === null) {
    return { status, code: 'network', message: "Couldn't reach the portal. Check your connection and try again.", fields: {} };
  }
  if (isRecord(data) && Array.isArray(data.issues)) {
    const fields: Record<string, string> = {};
    for (const slot of data.issues) {
      if (!isRecord(slot) || !Array.isArray(slot.issues)) continue;
      for (const issue of slot.issues) {
        if (!isRecord(issue) || typeof issue.message !== 'string') continue;
        const path = typeof issue.path === 'string' && issue.path ? issue.path : String(slot.slot ?? 'form');
        fields[path] ??= friendlyIssue(issue.message);
      }
    }
    return { status, code: 'validation_failed', message: 'Check the highlighted fields.', fields };
  }
  const code = typeof data === 'string' && data.length <= 120 ? data.trim() : '';
  return { status, code, message: describeCode(code, status), fields: {} };
}
