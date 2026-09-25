/**
 * What a new source looks like on the wire. Free of server-only imports: the Knowledge screen
 * validates with the same schema before it draws a row, so the server rarely has to refuse.
 */
import { z } from 'zod';

/** Pasted text larger than this is really a file; the upload path handles those. */
export const MAX_TEXT_CHARS = 500_000;

const title = z
  .string()
  .trim()
  .min(1, 'Give the source a title.')
  .max(200, 'Keep the title under 200 characters.');
const optionalTitle = z
  .string()
  .trim()
  .max(200, 'Keep the title under 200 characters.')
  .optional()
  .transform((value) => value || undefined);
const httpUrl = z
  .string({ error: 'Enter a web address.' })
  .trim()
  .min(1, 'Enter a web address.')
  .refine((value) => {
    try {
      const url = new URL(value);

      return (url.protocol === 'http:' || url.protocol === 'https:') && Boolean(url.hostname);
    } catch {
      return false;
    }
  }, 'Enter a full address that starts with http:// or https://.');
const assistantId = z.uuid({ error: 'Pick an assistant.' });
/** The screen may choose the row's id so the row it draws before the answer is the real one. */
const clientId = z.uuid({ error: 'The source id is not valid.' }).optional();

export const sourceInputSchema = z.discriminatedUnion(
  'kind',
  [
    z.object({
      kind: z.literal('url'),
      assistantId,
      id: clientId,
      url: httpUrl,
      title: optionalTitle,
    }),
    z.object({
      kind: z.literal('sitemap'),
      assistantId,
      id: clientId,
      url: httpUrl,
      title: optionalTitle,
    }),
    z.object({
      kind: z.literal('text'),
      assistantId,
      id: clientId,
      title,
      text: z
        .string({ error: 'Paste some text.' })
        .trim()
        .min(1, 'Paste some text.')
        .max(MAX_TEXT_CHARS, 'That is more than 500,000 characters. Upload it as a file instead.'),
    }),
  ],
  { error: 'Choose a website, sitemap, upload or pasted text.' },
);

export type SourceInput = z.infer<typeof sourceInputSchema>;

/** The fields of an upload's multipart form, apart from the file itself. */
export const uploadFieldsSchema = z.object({ assistantId, id: clientId, title: optionalTitle });

/** The first problem zod found, phrased for people. */
export const firstIssue = (error: z.ZodError) =>
  error.issues[0]?.message ?? 'Check the form and try again.';

/** The strings of a FormData, with everything else left out. */
export const formFields = (form: FormData, names: string[]) =>
  Object.fromEntries(
    names.flatMap((name) => {
      const value = form.get(name);

      return typeof value === 'string' ? [[name, value]] : [];
    }),
  ) as Record<string, string>;
