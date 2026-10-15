export function commentBody(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new Error('Comment must contain 1–4000 characters');
  return value.trim();
}
