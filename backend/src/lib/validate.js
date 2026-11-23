import { z } from 'zod';
import { badRequest } from './errors.js';

/** Format zod issues into { field: message } plus a readable summary. */
export function formatZodError(error) {
  const fields = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || '_';
    if (!fields[key]) fields[key] = issue.message;
  }
  return fields;
}

/** Parse `data` with `schema`, throwing a 400 with per-field messages on failure. */
export function parse(schema, data) {
  const result = schema.safeParse(data ?? {});
  if (!result.success) {
    const fields = formatZodError(result.error);
    const summary = Object.entries(fields)
      .map(([k, v]) => (k === '_' ? v : `${k}: ${v}`))
      .join('; ');
    throw badRequest(`Validation failed: ${summary}`, { fields });
  }
  return result.data;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** True if `s` is a real calendar date in YYYY-MM-DD form. */
export function isValidDateString(s) {
  if (typeof s !== 'string' || !DATE_RE.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

/** Required calendar date (YYYY-MM-DD) -> Date at UTC midnight. */
export const zDate = z
  .string({ error: 'Date is required' })
  .trim()
  .refine(isValidDateString, { message: 'Must be a valid date (YYYY-MM-DD)' })
  .transform((s) => new Date(`${s}T00:00:00Z`));

/** Optional date: '', null become null; a missing key stays undefined (= "not provided"). */
export const zOptionalDate = z
  .union([z.string(), z.null(), z.undefined()], { error: 'Must be a valid date (YYYY-MM-DD)' })
  .transform((v, ctx) => {
    const s = typeof v === 'string' ? v.trim() : '';
    if (!s) return null;
    if (!isValidDateString(s)) {
      ctx.addIssue({ code: 'custom', message: `"${s.slice(0, 20)}" is not a valid date (use YYYY-MM-DD)` });
      return z.NEVER;
    }
    return new Date(`${s}T00:00:00Z`);
  })
  .optional();

/** Optional trimmed string with max length; empty -> null; a missing key stays undefined. */
export const zOptionalText = (max = 255) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === 'string' ? v.trim() : v))
    .refine((v) => v == null || v.length <= max, { message: `Must be at most ${max} characters` })
    .transform((v) => (v ? v : null))
    .optional();

export const zRequiredText = (label, max = 255) =>
  z
    .string({ error: `${label} is required` })
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} must be at most ${max} characters`);

/** Money: accepts number or numeric string, >= 0, max 2 decimals. */
export const zMoney = z
  .union([z.number(), z.string().trim()])
  .transform((v, ctx) => {
    if (v === '' || v == null) return 0;
    const n = typeof v === 'number' ? v : Number(String(v).replace(/[,₹$\s]/g, ''));
    if (!Number.isFinite(n)) {
      ctx.addIssue({ code: 'custom', message: 'Must be a number' });
      return z.NEVER;
    }
    if (n < 0) {
      ctx.addIssue({ code: 'custom', message: 'Must be zero or more' });
      return z.NEVER;
    }
    if (n > 9_999_999_999) {
      ctx.addIssue({ code: 'custom', message: 'Amount is too large' });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

export const zEmail = z.string({ error: 'Email is required' }).trim().toLowerCase().pipe(z.email('Must be a valid email address').max(254));

export const zId = z.coerce.number().int().positive();

/** Parse :id route parameter. */
export function parseId(value, label = 'id') {
  const r = zId.safeParse(value);
  if (!r.success) throw badRequest(`Invalid ${label}`);
  return r.data;
}

/** Password policy: 8+ chars, at least one letter and one number. */
export const zPassword = z
  .string({ error: 'Password is required' })
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), { message: 'Password must contain a letter and a number' });

export { z };
