import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import OverviewLoading from './loading';

const skeletonsIn = (node: Element) => node.querySelectorAll('[data-slot="skeleton"]').length;

describe('OverviewLoading', () => {
  it('is shaped like the Overview it stands in for', () => {
    render(<OverviewLoading />);

    const skeleton = screen.getByTestId('overview-loading');
    const [header, quality, gaps, pair, content, usage] = [...skeleton.children];

    expect(skeleton).toHaveAttribute('aria-busy', 'true');
    // The header, answer quality, gaps, disliked beside pages, content, usage beside leads.
    expect(skeleton.children).toHaveLength(6);
    // A title and the period switch.
    expect(skeletonsIn(header!)).toBe(3);
    // Title, reason, three numbers of three lines each, the trend and the footer.
    expect(skeletonsIn(quality!)).toBe(2 + 9 + 1 + 1);
    expect(gaps!.querySelectorAll('.border-b.px-4')).toHaveLength(4);
    expect(pair!.children).toHaveLength(2);
    expect(content!.querySelector('.lg\\:grid-cols-2')).not.toBeNull();
    expect(usage!.children).toHaveLength(2);
  });
});
