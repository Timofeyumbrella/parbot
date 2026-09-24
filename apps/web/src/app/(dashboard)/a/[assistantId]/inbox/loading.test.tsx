import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { isConversationPath } from '@/lib/analytics';

import InboxLoading from './loading';

const pathname = vi.hoisted(() => ({ value: '/a/asst/inbox' }));

vi.mock('next/navigation', () => ({
  usePathname: () => pathname.value,
}));

describe('isConversationPath', () => {
  it('tells the conversation route from the list', () => {
    expect(isConversationPath('/a/asst/inbox')).toBe(false);
    expect(isConversationPath('/a/asst/inbox/')).toBe(false);
    expect(isConversationPath('/a/asst/inbox/1f2e3d4c-0000-4000-8000-000000000000')).toBe(true);
    expect(isConversationPath('/a/asst/inbox/1f2e3d4c-0000-4000-8000-000000000000/')).toBe(true);
    expect(isConversationPath('/a/asst/knowledge')).toBe(false);
  });
});

describe('InboxLoading', () => {
  it('shows the list skeleton on the inbox itself', () => {
    pathname.value = '/a/asst/inbox';
    render(<InboxLoading />);

    expect(screen.getByTestId('inbox-list-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('conversation-skeleton')).not.toBeInTheDocument();
  });

  it('takes the conversation shape once the path points at one', () => {
    pathname.value = '/a/asst/inbox/1f2e3d4c-0000-4000-8000-000000000000';
    render(<InboxLoading />);

    expect(screen.getByTestId('conversation-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('inbox-list-skeleton')).not.toBeInTheDocument();
  });
});
