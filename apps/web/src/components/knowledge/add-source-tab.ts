/**
 * The Add source dialog's tabs as plain data, outside the client component, so the server can
 * read `?add=` (the Overview's "Add docs" link) into the tab to open.
 */
export const ADD_SOURCE_KINDS = ['url', 'sitemap', 'upload', 'text'] as const;

export type AddSourceTab = (typeof ADD_SOURCE_KINDS)[number];

/** Reads `?add=` into a tab of the dialog, or null when the dialog should stay closed. */
export const parseAddSourceTab = (value: string | string[] | undefined): AddSourceTab | null => {
  const raw = Array.isArray(value) ? value[0] : value;

  return ADD_SOURCE_KINDS.find((kind) => kind === raw) ?? null;
};
