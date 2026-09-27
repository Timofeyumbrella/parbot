'use client';

import { useSyncExternalStore } from 'react';

const noop = () => () => {};

/**
 * False while the server renders and while the browser hydrates that HTML, true from the render
 * after. A value the server could not have had (the viewer's time zone, a cache another Suspense
 * boundary fills as it hydrates) is read only once this is true, so the hydration render matches
 * the server's markup and React has nothing to throw away.
 */
export const useHydrated = () =>
  useSyncExternalStore(
    noop,
    () => true,
    () => false,
  );
