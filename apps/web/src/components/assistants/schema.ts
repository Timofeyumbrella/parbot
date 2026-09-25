import { z } from 'zod';

import { isSlug, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '@/lib/slug';

export const NAME_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 500;
export const INSTRUCTIONS_MAX_LENGTH = 4000;

export const SLUG_HELP = `${SLUG_MIN_LENGTH} to ${SLUG_MAX_LENGTH} lowercase letters, numbers and single hyphens.`;

const name = z
  .string()
  .trim()
  .min(1, { error: 'Give the assistant a name.' })
  .max(NAME_MAX_LENGTH, { error: `Keep the name under ${NAME_MAX_LENGTH} characters.` });

const slug = z.string().trim().toLowerCase().refine(isSlug, { error: SLUG_HELP });

/** Empty means "derive it from the name". */
const optionalSlug = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === '' || isSlug(value), { error: SLUG_HELP });

const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH, {
    error: `Keep the description under ${DESCRIPTION_MAX_LENGTH} characters.`,
  });

export const assistantIdSchema = z.uuid({ error: 'That assistant does not exist.' });

export const createAssistantSchema = z.object({
  name,
  slug: optionalSlug,
  description,
});

export const updateAssistantSchema = z.object({
  assistantId: assistantIdSchema,
  name,
  slug,
  description,
  instructions: z
    .string()
    .trim()
    .max(INSTRUCTIONS_MAX_LENGTH, {
      error: `Keep the instructions under ${INSTRUCTIONS_MAX_LENGTH} characters.`,
    }),
});

export const deleteAssistantSchema = z.object({
  assistantId: assistantIdSchema,
  confirmName: z.string(),
});

export type CreateAssistantInput = z.infer<typeof createAssistantSchema>;
export type UpdateAssistantInput = z.infer<typeof updateAssistantSchema>;

export const CREATE_FIELDS = ['name', 'slug', 'description'] as const;
/**
 * The welcome message and suggested questions are not here: readers see them in the widget, so
 * they are edited on the Widget page (lib/widget-api.ts validates them against @parbot/shared).
 */
export const UPDATE_FIELDS = [
  'assistantId',
  'name',
  'slug',
  'description',
  'instructions',
] as const;
export const DELETE_FIELDS = ['assistantId', 'confirmName'] as const;

export type CreateField = (typeof CREATE_FIELDS)[number];
export type UpdateField = (typeof UPDATE_FIELDS)[number];
export type DeleteField = (typeof DELETE_FIELDS)[number];

/** Same shape as the database default: `pb_` and 32 hex characters. */
export const PUBLIC_KEY_PATTERN = /^pb_[0-9a-f]{32}$/;

export const newPublicKey = () => {
  const bytes = new Uint8Array(16);

  crypto.getRandomValues(bytes);

  return `pb_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')}`;
};
