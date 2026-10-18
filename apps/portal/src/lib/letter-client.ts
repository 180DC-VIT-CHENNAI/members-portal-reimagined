import { api } from './api.ts';
export const loadLetters = () => api('/api/letters');
export const loadLetter = (id: string) => api('/api/letters/:id', { params: { id } });
export type SavedLetter = Awaited<ReturnType<typeof loadLetters>>[number];
export type LetterDetail = Awaited<ReturnType<typeof loadLetter>>;
export interface SavedPdf { readonly id: string; readonly docnum: string; readonly filename: string; readonly bytes: number; readonly downloadUrl: string; readonly emailEligible: boolean; }
