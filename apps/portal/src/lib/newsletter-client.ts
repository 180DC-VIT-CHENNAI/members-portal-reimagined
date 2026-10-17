import { api } from './api.ts';
export const loadIssues = () => api('/api/newsletter/issues');
export const loadIssue = (id: string) => api('/api/newsletter/issues/:id', { params: { id } });
export type IssueSummary = Awaited<ReturnType<typeof loadIssues>>[number];
export type EditorIssue = Awaited<ReturnType<typeof loadIssue>>;
export interface NewsletterAsset {
  readonly id: string;
  readonly filename: string;
  readonly bytes: number;
  readonly contentType: string;
}
