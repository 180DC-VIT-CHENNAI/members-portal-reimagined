import * as v from 'valibot';
import { optionalText } from './validation';

/** An https link, or a same-origin path such as /partners/logo.png. */
export const linkUrl = v.optional(
  v.nullable(
    v.pipe(
      v.string(),
      v.trim(),
      v.maxLength(500),
      v.check((value) => {
        if (value.startsWith('/')) return !value.startsWith('//') && !value.startsWith('/\\');
        try {
          return new URL(value).protocol === 'https:';
        } catch {
          return false;
        }
      }, 'invalid_link'),
    ),
  ),
);

export const caseStudyBody = v.object({
  tag: optionalText(255),
  title: optionalText(255),
  description: optionalText(255),
  content: v.pipe(v.string(), v.minLength(10), v.maxLength(100_000)),
  imageUrl: linkUrl,
  sourceFileUrl: linkUrl,
});

export const decisionBody = v.object({
  emailSubject: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(255)),
  emailBody: v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(4000)),
});
