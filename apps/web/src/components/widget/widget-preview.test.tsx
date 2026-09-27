import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WidgetPreview } from './widget-preview';

const props = {
  demoPath: '/demo/pb_key',
  demoUrl: 'https://app.parbot.test/demo/pb_key',
  mode: 'palette' as const,
  hasSources: true,
  knowledgeHref: '/a/1/knowledge',
};

describe('WidgetPreview', () => {
  it('carries the config version on the demo link as well as on the frame', () => {
    const { rerender } = render(<WidgetPreview {...props} version="mukjfrob" />);

    expect(screen.getByRole('link', { name: 'Open the demo page' })).toHaveAttribute(
      'href',
      'https://app.parbot.test/demo/pb_key?v=mukjfrob',
    );
    expect(screen.getByTitle('Widget preview')).toHaveAttribute(
      'src',
      '/demo/pb_key?mode=palette&v=mukjfrob&open=1',
    );

    // A save hands back the next version, and a tab opened from the link after it asks for it.
    rerender(<WidgetPreview {...props} mode="bubble" version="mukjfs00" />);

    expect(screen.getByRole('link', { name: 'Open the demo page' })).toHaveAttribute(
      'href',
      'https://app.parbot.test/demo/pb_key?v=mukjfs00',
    );
    expect(screen.getByTitle('Widget preview')).toHaveAttribute(
      'src',
      '/demo/pb_key?mode=bubble&v=mukjfs00&open=1',
    );
  });
});
