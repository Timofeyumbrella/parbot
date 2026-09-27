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
