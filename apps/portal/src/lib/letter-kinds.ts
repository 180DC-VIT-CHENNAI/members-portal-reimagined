export const LETTER_TYPES = ['appointment', 'promotion', 'termination', 'transfer', 'resignation', 'showcause', 'service', 'relieving', 'recognition', 'mou', 'announcement', 'department-report', 'ldi'] as const;
export type LetterType = (typeof LETTER_TYPES)[number];
export const LETTER_LABELS = { appointment: 'Appointment', promotion: 'Promotion', termination: 'Termination', transfer: 'Transfer', resignation: 'Resignation', showcause: 'Show-cause notice', service: 'Service certificate', relieving: 'Relieving', recognition: 'Recognition', mou: 'Memorandum of understanding', announcement: 'Announcement', 'department-report': 'Department report', ldi: 'Leadership decision / initiative' } as const satisfies Record<LetterType, string>;
export const MAX_LETTER_EMAIL_BYTES = 3 * 1024 * 1024;
export const MAX_LETTER_STORAGE_BYTES = 20 * 1024 * 1024;

export function isLetterType(value: string): value is LetterType { return LETTER_TYPES.some((type) => type === value); }
