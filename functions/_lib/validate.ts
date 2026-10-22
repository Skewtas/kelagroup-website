// KELA OS – serverbaserad validering av all indata. Små, explicita regler utan beroenden.
import { HttpError } from './core';

type Rule<T> = { parse: (v: unknown, path: string, errs: Record<string, string>) => T | undefined; optional?: boolean };
type Shape = Record<string, Rule<any>>;
type Out<S extends Shape> = { [K in keyof S]: S[K] extends Rule<infer T> ? T : never };

function fail(errs: Record<string, string>, path: string, msg: string) {
  errs[path] = msg;
  return undefined;
}

const isEmpty = (v: unknown) => v === undefined || v === null || v === '';

export const v = {
  str(o: { min?: number; max?: number; optional?: boolean; trim?: boolean; pattern?: RegExp; msg?: string } = {}): Rule<string | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : fail(e, p, 'Obligatoriskt fält.');
        if (typeof val !== 'string' && typeof val !== 'number') return fail(e, p, 'Ogiltigt värde.');
        let s = String(val);
        if (o.trim !== false) s = s.trim();
        // Ta bort styrtecken (utom radbrytning och tab).
        s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '');
        if (s === '' && o.optional) return null;
        if (o.min && s.length < o.min) return fail(e, p, `Minst ${o.min} tecken.`);
        if (s.length > (o.max ?? 500)) return fail(e, p, `Högst ${o.max ?? 500} tecken.`);
        if (o.pattern && !o.pattern.test(s)) return fail(e, p, o.msg || 'Ogiltigt format.');
        return s;
      },
    };
  },
  email(o: { optional?: boolean } = {}): Rule<string | null> {
    return v.str({ ...o, max: 254, pattern: /^[^\s@<>()]+@[^\s@<>()]+\.[^\s@<>()]{2,}$/, msg: 'Ogiltig e-postadress.' });
  },
  url(o: { optional?: boolean } = {}): Rule<string | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        const s = v.str({ optional: o.optional, max: 300 }).parse(val, p, e);
        if (!s) return s as null;
        const withProto = /^https?:\/\//i.test(s) ? s : `https://${s}`;
        try {
          const u = new URL(withProto);
          if (!['http:', 'https:'].includes(u.protocol)) return fail(e, p, 'Endast http/https.');
          return u.toString().replace(/\/$/, '');
        } catch {
          return fail(e, p, 'Ogiltig webbadress.');
        }
      },
    };
  },
  int(o: { min?: number; max?: number; optional?: boolean } = {}): Rule<number | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : fail(e, p, 'Obligatoriskt fält.');
        const n = typeof val === 'number' ? val : Number(val);
        if (!Number.isSafeInteger(n)) return fail(e, p, 'Måste vara ett heltal.');
        if (o.min !== undefined && n < o.min) return fail(e, p, `Minst ${o.min}.`);
        if (o.max !== undefined && n > o.max) return fail(e, p, `Högst ${o.max}.`);
        return n;
      },
    };
  },
  num(o: { min?: number; max?: number; optional?: boolean } = {}): Rule<number | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : fail(e, p, 'Obligatoriskt fält.');
        const n = Number(val);
        if (!Number.isFinite(n)) return fail(e, p, 'Måste vara ett tal.');
        if (o.min !== undefined && n < o.min) return fail(e, p, `Minst ${o.min}.`);
        if (o.max !== undefined && n > o.max) return fail(e, p, `Högst ${o.max}.`);
        return n;
      },
    };
  },
  bool(o: { optional?: boolean } = {}): Rule<boolean | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : false;
        if (typeof val === 'boolean') return val;
        if (val === 1 || val === '1' || val === 'true') return true;
        if (val === 0 || val === '0' || val === 'false') return false;
        return fail(e, p, 'Ogiltigt värde.');
      },
    };
  },
  enum<T extends string>(values: readonly T[], o: { optional?: boolean } = {}): Rule<T | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : fail(e, p, 'Obligatoriskt fält.');
        if (!values.includes(val as T)) return fail(e, p, 'Ogiltigt val.');
        return val as T;
      },
    };
  },
  date(o: { optional?: boolean } = {}): Rule<string | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : fail(e, p, 'Obligatoriskt fält.');
        const s = String(val).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(Date.parse(s))) return fail(e, p, 'Ogiltigt datum.');
        return s;
      },
    };
  },
  id(prefix: string, o: { optional?: boolean } = {}): Rule<string | null> {
    return v.str({ optional: o.optional, max: 40, pattern: new RegExp(`^${prefix}_[0-9a-z]{8,32}$`), msg: 'Ogiltigt id.' });
  },
  list<T>(item: Rule<T>, o: { max?: number; optional?: boolean } = {}): Rule<T[] | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : [];
        if (!Array.isArray(val)) return fail(e, p, 'Måste vara en lista.');
        if (val.length > (o.max ?? 100)) return fail(e, p, `Högst ${o.max ?? 100} rader.`);
        const out: T[] = [];
        val.forEach((x, i) => {
          const r = item.parse(x, `${p}.${i}`, e);
          if (r !== undefined) out.push(r as T);
        });
        return out;
      },
    };
  },
  obj<S extends Shape>(shape: S, o: { optional?: boolean } = {}): Rule<Out<S> | null> {
    return {
      optional: o.optional,
      parse(val, p, e) {
        if (isEmpty(val)) return o.optional ? null : fail(e, p, 'Obligatoriskt fält.');
        if (typeof val !== 'object' || Array.isArray(val)) return fail(e, p, 'Ogiltigt objekt.');
        return parseShape(shape, val as Record<string, unknown>, e, p, false) as Out<S>;
      },
    };
  },
};

function parseShape(shape: Shape, input: Record<string, unknown>, errs: Record<string, string>, base: string, partial: boolean) {
  const out: Record<string, unknown> = {};
  for (const [k, rule] of Object.entries(shape)) {
    if (partial && !(k in input)) continue;
    const r = rule.parse(input[k], base ? `${base}.${k}` : k, errs);
    if (r !== undefined) out[k] = r;
  }
  return out;
}

/** Validerar hela objektet. partial=true: bara fält som skickats valideras (för PATCH). */
export function validate<S extends Shape>(shape: S, input: unknown, partial = false): Out<S> {
  if (!input || typeof input !== 'object') throw new HttpError(422, 'validation', 'Ogiltig indata.');
  const errs: Record<string, string> = {};
  const out = parseShape(shape, input as Record<string, unknown>, errs, '', partial);
  if (Object.keys(errs).length) throw new HttpError(422, 'validation', 'Kontrollera fälten.', errs);
  return out as Out<S>;
}
