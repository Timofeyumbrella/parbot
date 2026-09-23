/** Landing page metadata shared by the page and its generated Open Graph image. */
export const SITE_TITLE = 'Parbot · Ask-AI for developer docs';

export const SITE_DESCRIPTION =
  'Add an assistant to your developer docs with one script tag. Streamed answers with citations in a floating bubble or a ⌘K palette, and an inbox with the questions your docs did not answer.';

export const OG_IMAGE = {
  /** The route app/opengraph-image.tsx serves. Named here so page metadata can reference it. */
  url: '/opengraph-image',
  width: 1200,
  height: 630,
  alt: 'Parbot: an assistant for developer docs that answers with citations',
} as const;
