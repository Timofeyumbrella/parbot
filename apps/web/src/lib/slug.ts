/** Mirrors the check constraint on assistants.slug. */
export const SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;
export const SLUG_MIN_LENGTH = 2;
export const SLUG_MAX_LENGTH = 48;

const FALLBACK_WORD = 'assistant';

const trimHyphens = (value: string) => value.replace(/^-+|-+$/g, '');

/**
 * Turns a name into a slug the database accepts: ASCII lowercase, digits and single hyphens,
 * 2 to 48 characters. Accents are stripped rather than dropped, so "Café" becomes "cafe".
 */
export const slugify = (input: string): string => {
  const slug = trimHyphens(
    input
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-'),
  );
  const fitted = trimHyphens(slug.slice(0, SLUG_MAX_LENGTH));

  if (fitted.length >= SLUG_MIN_LENGTH) {
    return fitted;
  }

  return fitted ? `${fitted}-${FALLBACK_WORD}` : FALLBACK_WORD;
};

export const isSlug = (value: string) =>
  value.length >= SLUG_MIN_LENGTH && value.length <= SLUG_MAX_LENGTH && SLUG_PATTERN.test(value);

/** `base-n`, shortening the base so the result still fits the column. */
export const withSuffix = (base: string, n: number) => {
  const suffix = `-${n}`;
  const room = SLUG_MAX_LENGTH - suffix.length;

  return `${trimHyphens(base.slice(0, room))}${suffix}`;
};

/** The base slug when it is free, otherwise the first of base-2, base-3, ... that is. */
export const uniqueSlug = (base: string, taken: Iterable<string>): string => {
  const used = new Set(taken);

  if (!used.has(base)) {
    return base;
  }

  for (let n = 2; ; n += 1) {
    const candidate = withSuffix(base, n);

    if (!used.has(candidate)) {
      return candidate;
    }
  }
};
