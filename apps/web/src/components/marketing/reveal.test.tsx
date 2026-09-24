import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { Reveal } from './reveal';

afterEach(cleanup);

describe('Reveal', () => {
  it('renders its content visible when there is no IntersectionObserver', () => {
    render(
      <Reveal>
        <p>Below the fold</p>
      </Reveal>,
    );

    const wrapper = screen.getByText('Below the fold').parentElement!;

    expect(wrapper.tagName).toBe('DIV');
    expect(wrapper.className).not.toContain('opacity-0');
  });

  it('can render as a list item so lists stay valid', () => {
    render(
      <ul>
        <Reveal as="li" delay={90}>
          Item
        </Reveal>
      </ul>,
    );

    const item = screen.getByRole('listitem');

    expect(item.parentElement?.tagName).toBe('UL');
    expect(item).toHaveStyle({ transitionDelay: '90ms' });
  });
});
