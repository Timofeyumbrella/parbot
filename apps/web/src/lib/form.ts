import type { ZodError, ZodType } from 'zod';

export type FieldErrors<Field extends string = string> = Partial<Record<Field, string>>;

/** What a server action hands back to `useActionState`. */
export type FormState<Field extends string = string> = {
  status: 'idle' | 'error' | 'success';
  /** About the whole form: what happened and what to try. */
  error?: string;
  /** Shown as a toast or inline note after a successful submit. */
  message?: string;
  fieldErrors?: FieldErrors<Field>;
  /** What the visitor typed, so a failed submit does not wipe the form. Never put secrets here. */
  values?: Partial<Record<Field, string>>;
};

export const idleState: FormState = { status: 'idle' };

/** Reads the named fields as strings. Missing fields become empty strings so zod messages stay human. */
export const formValues = <Field extends string>(
  formData: FormData,
  fields: readonly Field[],
): Record<Field, string> => {
  const values = {} as Record<Field, string>;

  for (const field of fields) {
    const raw = formData.get(field);

    values[field] = typeof raw === 'string' ? raw : '';
  }

  return values;
};

/** The first message per top level field, in the order zod reported them. */
export const fieldErrorsOf = <Field extends string>(error: ZodError): FieldErrors<Field> => {
  const errors: FieldErrors<Field> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];

    if (typeof field === 'string' && !errors[field as Field]) {
      errors[field as Field] = issue.message;
    }
  }

  return errors;
};

export type ParseResult<Output, Field extends string> =
  | { ok: true; data: Output }
  | { ok: false; state: FormState<Field> };

/**
 * Validates a submit. On failure the returned state carries the field messages and the values
 * to refill, minus any field listed in `secret`.
 */
export const parseForm = <Output, Field extends string>(
  schema: ZodType<Output>,
  values: Record<Field, string>,
  secret: readonly Field[] = [],
): ParseResult<Output, Field> => {
  const parsed = schema.safeParse(values);

  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }

  return {
    ok: false,
    state: {
      status: 'error',
      error: 'Check the highlighted fields.',
      fieldErrors: fieldErrorsOf<Field>(parsed.error),
      values: publicValues(values, secret),
    },
  };
};

export const publicValues = <Field extends string>(
  values: Record<Field, string>,
  secret: readonly Field[] = [],
): Partial<Record<Field, string>> => {
  const kept: Partial<Record<Field, string>> = { ...values };

  for (const field of secret) {
    delete kept[field];
  }

  return kept;
};

const ORIGIN = 'http://parbot.local';

/**
 * Only a same-site path is a safe place to send someone after they sign in. Anything that
 * could resolve to another host (`//evil.com`, `https://…`, backslashes, control characters)
 * is rejected, as is a path that would bounce straight back to the sign-in pages.
 */
export const safeNextPath = (value: unknown): string | null => {
  if (typeof value !== 'string' || !value.startsWith('/') || /^\/[\/\\]/.test(value)) {
    return null;
  }

  if (/[\u0000-\u001f\u007f]/.test(value)) {
    return null;
  }

  let url: URL;

  try {
    url = new URL(value, ORIGIN);
  } catch {
    return null;
  }

  if (url.origin !== ORIGIN || url.pathname === '/login' || url.pathname === '/signup') {
    return null;
  }

  return `${url.pathname}${url.search}${url.hash}`;
};
