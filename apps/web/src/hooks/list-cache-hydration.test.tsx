import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ConversationRow } from '@/lib/chat/conversations';
import type { ProjectRow } from '@/lib/chat/projects';
import { conversationsKey, projectsKey } from '@/lib/chat/queries';

import { useConversationListCache, useConversationRow } from './use-conversations';
import { useProjectRow } from './use-projects';

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({}),
  realtimeReadyClient: async () => ({}),
}));

const ASSISTANT = 'a1';

const project: ProjectRow = {
  id: 'p1',
  name: 'Launch',
  instructions: '',
  sources: [],
  created_at: '2026-09-20T10:00:00Z',
  updated_at: '2026-09-20T10:00:00Z',
};

const conversation = {
  id: 'c1',
  title: 'What does the runbook say?',
  project_id: 'p1',
} as ConversationRow;

/** Reads the caches the chat's list pane seeds, the way a project's home and a thread do. */
const Screen = () => {
  const row = useProjectRow(ASSISTANT, 'p1');
  const chats = useConversationListCache(ASSISTANT);
  const open = useConversationRow(ASSISTANT, 'c1');

  return (
    <p>{`${row === undefined ? 'loading' : (row?.name ?? 'none')} · ${chats?.length ?? 'no list'} · ${open?.project_id ?? 'no project'}`}</p>
  );
};

const withClient = (client: QueryClient) => (
  <QueryClientProvider client={client}>
    <Screen />
  </QueryClientProvider>
);

describe('screens that read the list pane’s caches', () => {
  let container: HTMLDivElement | null = null;

  afterEach(() => {
    container?.remove();
    container = null;
  });

  it('hydrate to what the server rendered, then show the list the pane seeded', async () => {
    // The server renders the screen before the list pane's Suspense boundary has its rows.
    const html = renderToString(withClient(new QueryClient()));

    expect(html).toContain('loading · no list · no project');

    // In the browser the pane's boundary may hydrate first and seed the caches (React #418).
    const client = new QueryClient();
    client.setQueryData(projectsKey(ASSISTANT), [project]);
    client.setQueryData(conversationsKey(ASSISTANT), [conversation]);

    container = document.createElement('div');
    container.innerHTML = html;
    document.body.append(container);

    const recoverable: unknown[] = [];

    await act(async () => {
      hydrateRoot(container!, withClient(client), {
        onRecoverableError: (error) => recoverable.push(error),
      });
    });

    expect(recoverable).toEqual([]);
    expect(container.textContent).toBe('Launch · 1 · p1');
  });
});
