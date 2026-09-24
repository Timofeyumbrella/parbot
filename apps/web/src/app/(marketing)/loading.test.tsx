import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import Loading from './loading';

describe('marketing loading state', () => {
  afterEach(cleanup);

  it('is a busy main landmark shaped like the hero', () => {
    render(<Loading />);

    const main = screen.getByRole('main', { name: 'Loading' });

    expect(main).toHaveAttribute('aria-busy', 'true');
    expect(main.querySelectorAll('[data-slot="skeleton"]').length).toBeGreaterThan(5);
  });
});
