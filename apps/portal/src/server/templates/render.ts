import { escapeHtml } from '../html.ts';
import type { Definition, Values } from './validation.ts';

export const AUTOMATIC_KEYS = ['member_name', 'member_position', 'club_name', 'club_website'] as const;
export type RenderResult = { readonly subject: string; readonly text: string; readonly html: string; readonly signature: string; readonly warnings: readonly string[] };

/** Text-only interpolation: no expressions, HTML sources, helpers or executable code. */
export function renderTemplate(definition: Definition, values: Values, trusted: Readonly<Record<string, string>>): RenderResult {
  const warnings: string[] = [];
  const resolved: Record<string, string> = { ...trusted };
  for (const key of Object.keys(values)) {
    if (!definition.fields.some((f) => f.key === key)) warnings.push(`Unknown field: ${key}`);
  }
  for (const f of definition.fields) {
    const value = values[f.key];
    const missing = value === undefined || value === '' || (Array.isArray(value) && !value.length);
    if (missing) {
      if (f.required) warnings.push(`Required field: ${f.label}`);
      resolved[f.key] = '';
      continue;
    }
    let valid = true;
    switch (f.type) {
      case 'boolean': valid = typeof value === 'boolean'; break;
      case 'amount': valid = typeof value === 'number' && Number.isFinite(value) && (f.min === undefined || value >= f.min) && (f.max === undefined || value <= f.max); break;
      case 'multi_select': valid = Array.isArray(value) && value.every((x) => typeof x === 'string' && f.options.includes(x)); break;
      case 'rows': valid = Array.isArray(value) && value.every((x) => typeof x === 'object' && x !== null && !Array.isArray(x)); break;
      case 'select': valid = typeof value === 'string' && f.options.includes(value); break;
      case 'date': valid = typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value; break;
      case 'url': {
        valid = typeof value === 'string' && /^https?:\/\/[^\s]+$/i.test(value);
        if (valid && typeof value === 'string') {
          try { const url = new URL(value); valid = !url.username && !url.password; } catch { valid = false; }
        }
        break;
      }
      case 'short':
      case 'long':
      case 'organization':
      case 'contact':
      case 'attachment':
        valid = typeof value === 'string' && value.length <= (f.type === 'long' ? 10_000 : 500);
        if (typeof value === 'string' && (f.min !== undefined && value.length < f.min || f.max !== undefined && value.length > f.max)) valid = false;
        break;
    }
    if (!valid) warnings.push(`Invalid field: ${f.label}`);
    if (f.type === 'rows' && Array.isArray(value)) {
      resolved[f.key] = value.map((row) => typeof row === 'object' && row !== null ? `- ${Object.values(row).join(' | ')}` : '').join('\n');
    } else if (Array.isArray(value)) resolved[f.key] = value.join(', ');
    else resolved[f.key] = String(value);
  }
  // Trusted keys win even when a caller supplies a matching field/value.
  Object.assign(resolved, trusted);
  const interpolate = (source: string) => source.replace(/\{\{([^{}]*)\}\}/g, (_, raw: string) => {
    const key = raw.trim();
    if (!/^[a-z][a-z0-9_]*$/.test(key) || !Object.hasOwn(resolved, key)) {
      warnings.push(`Unresolved variable: ${key}`);
      return `{{${key}}}`;
    }
    return resolved[key];
  });
  const subject = interpolate(definition.subject).replace(/[\r\n]+/g, ' ');
  const text = interpolate(definition.body), signature = interpolate(definition.signature);
  if (!subject.trim() || subject.length > 300) warnings.push('Subject must contain 1–300 characters');
  if (!text.trim() || text.length > 100_000) warnings.push('Message must contain 1–100000 characters');
  return { subject, text, signature, html: `<p>${escapeHtml(text).replace(/\n/g, '<br>')}</p>`, warnings: [...new Set(warnings)] };
}

export function definitionWarnings(d: Definition): readonly string[] {
  const keys = d.fields.map((f) => f.key);
  const errors: string[] = [];
  if (new Set(keys).size !== keys.length) errors.push('Duplicate field keys');
  if (keys.some((k) => AUTOMATIC_KEYS.some((a) => a === k))) errors.push('Automatic fields cannot be defined by authors');
  for (const f of d.fields) {
    if (['select', 'multi_select'].includes(f.type) && !f.options.length) errors.push(`Options required: ${f.label}`);
    if (f.min !== undefined && f.max !== undefined && f.min > f.max) errors.push(`Invalid bounds: ${f.label}`);
  }
  const allowed = new Set<string>([...keys, ...AUTOMATIC_KEYS]);
  for (const source of [d.subject, d.body, d.signature]) {
    for (const match of source.matchAll(/\{\{([^{}]*)\}\}/g)) if (!allowed.has(match[1].trim())) errors.push(`Unknown variable: ${match[1].trim()}`);
    if (source.replace(/\{\{[^{}]*\}\}/g, '').includes('{{')) errors.push('Malformed variable');
  }
  return errors;
}
