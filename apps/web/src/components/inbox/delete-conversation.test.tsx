import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { ConversationRow } from '@/lib/chat/conversations';
import { conversationsKey, threadKey } from '@/lib/chat/queries';

import { DeleteConversation } from './delete-conversation';

const router = vi.hoisted(() => ({ replace: vi.fn() }));
const action = vi.hoisted(() => ({ deleteConversation: vi.fn(async () => ({ deleted: true })) }));

vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock('@/app/(dashboard)/a/[assistantId]/inbox/[conversationId]/actions', () => action);

const ASSISTANT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const GONE = '0d6f3b7e-2c1a-4f5e-9a8b-1c2d3e4f5a6b';
const KEPT = '7a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d';

const row = (id: string): ConversationRow => ({
  id,
  title: `Chat ${id}`,
  last_message_at: '2026-09-23T10:00:00Z',
  message_count: 2,
  unanswered_count: 0,
});

describe('DeleteConversation', () => {
  it('takes the row out of the chat list and drops its thread, so Chat never lists it again', async () => {
    const user = userEvent.setup();
    const queryClient = new QueryClient();

    queryClient.setQueryData(conversationsKey(ASSISTANT), [row(GONE), row(KEPT)]);
    queryClient.setQueryData(threadKey(GONE), { messages: [], active: null });

    render(
      <QueryClientProvider client={queryClient}>
        <DeleteConversation assistantId={ASSISTANT} conversationId={GONE} />
      </QueryClientProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Delete conversation' }));
    await user.click(screen.getByRole('button', { name: 'Delete' }));

    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith(`/a/${ASSISTANT}/inbox`);
    });
    expect(
      queryClient.getQueryData<ConversationRow[]>(conversationsKey(ASSISTANT))?.map((r) => r.id),
    ).toEqual([KEPT]);
    expect(queryClient.getQueryData(threadKey(GONE))).toBeUndefined();
  });
});
