import { escapeHtml } from './html.ts';

const DAY = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' });

/** A YYYY-MM-DD date for an email, e.g. "30 Oct 2026". */
export function formatDay(value: string): string {
  return DAY.format(new Date(`${value}T00:00:00Z`));
}

export interface ProjectSummary {
  readonly name: string;
  readonly client: string | null;
  readonly deadline: string | null;
  readonly departments: readonly string[];
}

/** To a department's leads when a project is created for their department. */
export function projectCreatedHtml(project: ProjectSummary): string {
  const facts = [
    project.client ? `Client: ${escapeHtml(project.client)}` : null,
    `Departments: ${escapeHtml(project.departments.join(', '))}`,
    project.deadline ? `Deadline: ${escapeHtml(formatDay(project.deadline))}` : null,
  ].filter((fact) => fact !== null);
  return [
    `<h2>New project: ${escapeHtml(project.name)}</h2>`,
    `<p>${facts.join('<br>')}</p>`,
    '<p>You can add people and tasks to it in the members portal.</p>',
  ].join('\n');
}

/** To someone who has been added to a project. */
export function projectMemberHtml(projectName: string, role: string): string {
  return [
    `<h2>You're on ${escapeHtml(projectName)}</h2>`,
    `<p>Your role: ${escapeHtml(role)}.</p>`,
    '<p>You can see the project and its tasks in the members portal.</p>',
  ].join('\n');
}
