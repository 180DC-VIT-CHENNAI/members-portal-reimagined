import * as v from 'valibot';

export const id = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(64));
export const optionalText = (max: number) => v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.maxLength(max))));
export const emailAddress = v.pipe(v.string(), v.trim(), v.toLowerCase(), v.email(), v.maxLength(254));
export const fullName = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(120));
export const isoDate = v.pipe(v.string(), v.isoDate());
const httpsUrl = (host: RegExp) =>
  v.optional(
    v.nullable(
      v.pipe(
        v.string(),
        v.trim(),
        v.url(),
        v.maxLength(300),
        v.check((value) => {
          const u = new URL(value);
          return u.protocol === 'https:' && host.test(u.hostname);
        }, 'invalid_profile_url'),
      ),
    ),
  );

/** Fields a member may change on their own profile. */
export const profileFields = {
  fullName: v.optional(fullName),
  phone: v.optional(v.nullable(v.pipe(v.string(), v.trim(), v.regex(/^[+0-9 ()-]{6,20}$/, 'invalid_phone')))),
  regNo: optionalText(32),
  year: v.optional(v.nullable(v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(6)))),
  branch: optionalText(80),
  linkedinUrl: httpsUrl(/(^|\.)linkedin\.com$/),
  githubUrl: httpsUrl(/(^|\.)github\.com$/),
  photoKey: optionalText(200),
  bio: optionalText(1000),
  skills: v.optional(v.pipe(v.array(v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40))), v.maxLength(30))),
};
