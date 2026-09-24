import { z } from 'zod';

import { isSlug, SLUG_MAX_LENGTH, SLUG_MIN_LENGTH } from '@/lib/slug';

export const NAME_MAX_LENGTH = 80;
export const DESCRIPTION_MAX_LENGTH = 500;
export const INSTRUCTIONS_MAX_LENGTH = 4000;
export const WELCOME_MAX_LENGTH = 300;
export const SUGGESTED_QUESTIONS_MAX = 4;
export const SUGGESTED_QUESTION_MAX_LENGTH = 120;

export const SLUG_HELP = `${SLUG_MIN_LENGTH} to ${SLUG_MAX_LENGTH} lowercase letters, numbers and single hyphens.`;

const name = z
  .string()
  .trim()
  .min(1, { error: 'Give the assistant a name.' })
  .max(NAME_MAX_LENGTH, { error: `Keep the name under ${NAME_MAX_LENGTH} characters.` });

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isSlug, { error: SLUG_HELP });

/** Empty means "derive it from the name". */
const optionalSlug = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === '' || isSlug(value), { error: SLUG_HELP });

const description = z
  .string()
  .trim()
  .max(DESCRIPTION_MAX_LENGTH, { error: `Keep the description under ${DESCRIPTION_MAX_LENGTH} characters.` });

/** One question per line; blank lines are ignored. */
export const splitQuestions = (value: string) =>
  value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

const suggestedQuestions = z
  .string()
  .transform(splitQuestions)
  .pipe(
    z
      .array(
        z.string().max(SUGGESTED_QUESTION_MAX_LENGTH, {
          error: `Keep each question under ${SUGGESTED_QUESTION_MAX_LENGTH} characters.`,
        }),
      )
      .max(SUGGESTED_QUESTIONS_MAX, { error: `Up to ${SUGGESTED_QUESTIONS_MAX} questions, one per line.` }),
  );

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
    .max(INSTRUCTIONS_MAX_LENGTH, { error: `Keep the instructions under ${INSTRUCTIONS_MAX_LENGTH} characters.` }),
  welcomeMessage: z
    .string()
    .trim()
    .min(1, { error: 'The widget opens with this message, so it cannot be empty.' })
    .max(WELCOME_MAX_LENGTH, { error: `Keep the welcome message under ${WELCOME_MAX_LENGTH} characters.` }),
  suggestedQuestions,
});

export const deleteAssistantSchema = z.object({
  assistantId: assistantIdSchema,
  confirmName: z.string(),
});

export type CreateAssistantInput = z.infer<typeof createAssistantSchema>;
export type UpdateAssistantInput = z.infer<typeof updateAssistantSchema>;

export const CREATE_FIELDS = ['name', 'slug', 'description'] as const;
export const UPDATE_FIELDS = [
  'assistantId',
  'name',
  'slug',
  'description',
  'instructions',
  'welcomeMessage',
  'suggestedQuestions',
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
