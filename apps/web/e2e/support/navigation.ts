import { expect, type Page } from '@playwright/test';

/**
 * Waits until React has put everything the server streamed in its place.
 *
 * `page.goto` and `page.reload` resolve on `load`, but React holds a streamed Suspense boundary
 * (every route's `loading.tsx`) in a hidden `<div id="S:…">` and moves it into place in a batch
 * up to 300 ms later. When something above the boundary re-renders before that batch (next-themes
 * does as soon as it reads a light OS scheme, since the app defaults to dark), React renders the
 * boundary on the client instead and the hidden server copy stays in the document until the batch
 * runs. A reader never sees that copy, but a locator inside the page matches it too: `getByText`
 * resolves to two elements and strict mode fails the step.
 */
export const streamedIn = (page: Page) =>
  expect(
    page.locator('[hidden][id^="S:"]'),
    'streamed content still waits to be revealed',
  ).toHaveCount(0);

/** `page.goto`, then waits for the streamed page to settle (see `streamedIn`). */
export const visit = async (page: Page, url: string) => {
  const response = await page.goto(url);

  await streamedIn(page);

  return response;
};

/** `page.reload`, then waits for the streamed page to settle (see `streamedIn`). */
export const reload = async (page: Page) => {
  const response = await page.reload();

  await streamedIn(page);

  return response;
};
