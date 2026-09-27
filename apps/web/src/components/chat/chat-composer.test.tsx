import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AssistantProvider } from '@/components/assistant-context';
import { referenceSourcesKey } from '@/hooks/use-reference-sources';
import { resetDrafts } from '@/lib/chat/drafts';
import type { MessageReference } from '@/lib/chat/references';
import { composerUploads } from '@/lib/chat/uploads';
import type { Assistant, Source } from '@/lib/db';

import { ChatComposer } from './chat-composer';

const toast = vi.hoisted(() => ({ error: vi.fn(), success: vi.fn() }));

vi.mock('sonner', () => ({ toast }));

const db = vi.hoisted(() => ({ rows: [] as Partial<Source>[] }));

vi.mock('@/lib/supabase/client', () => ({
  getSupabaseBrowserClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => Promise.resolve({ data: db.rows, error: null }),
        }),
      }),
    }),
  }),
}));

const ASSISTANT = { id: 'asst-1', name: 'Acme Docs' } as Assistant;

const source = (patch: Partial<Source>): Partial<Source> => ({
  kind: 'text',
  status: 'ready',
  uri: null,
  storage_path: 'o/a/x.md',
  mime_type: 'text/markdown',
  byte_size: 120,
  created_at: '2026-09-20T10:00:00Z',
  ...patch,
});

let queryClient: QueryClient;

const renderComposer = (
  props: Partial<React.ComponentProps<typeof ChatComposer>> & {
    onSend?: (content: string, references: MessageReference[]) => void;
  } = {},
) =>
  render(
    <QueryClientProvider client={queryClient}>
      <AssistantProvider assistant={ASSISTANT}>
        <ChatComposer draftKey="c1" conversationReferences={[]} onSend={vi.fn()} {...props} />
      </AssistantProvider>
    </QueryClientProvider>,
  );

const box = () => screen.getByRole('textbox', { name: 'Message' });
const chipTexts = () => screen.queryAllByTestId('reference-chip').map((chip) => chip.textContent);

/** /api/sources, answered when the test says so. */
const uploads: { resolve: (response: Response) => void; body: FormData }[] = [];

beforeEach(() => {
  resetDrafts();
  composerUploads.reset();
  uploads.length = 0;
  queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  db.rows = [source({ id: 's-refund', title: 'Refund policy' })];
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, init?: RequestInit) =>
        new Promise<Response>((resolve) => {
          uploads.push({ resolve, body: init?.body as FormData });
        }),
    ),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('ChatComposer', () => {
  it('references an existing source with @ and sends it with the question', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    renderComposer({ onSend });
    await waitFor(() =>
      expect(queryClient.getQueryData(referenceSourcesKey('asst-1'))).toBeTruthy(),
    );

    await user.type(box(), 'What is the @refu');
    await user.keyboard('{Enter}');
    expect(chipTexts()).toEqual(['Refund policyReady']);

    await user.type(box(), 'window?{Enter}');

    expect(onSend).toHaveBeenCalledWith('What is the window?', [
      { id: 's-refund', title: 'Refund policy', kind: 'text' },
    ]);
  });

  it('uploads an attached file into Knowledge and follows it from Uploading to Ready', async () => {
    const user = userEvent.setup();

    renderComposer();

    const file = new File(['# Limits\n\nFive projects.'], 'limits.md', { type: 'text/markdown' });

    await user.upload(screen.getByLabelText('Choose a file to attach'), file);

    expect(chipTexts()).toEqual(['limits.mdUploading']);
    expect(uploads).toHaveLength(1);
    expect(uploads[0]!.body.get('assistantId')).toBe('asst-1');
    expect(uploads[0]!.body.get('file')).toBe(file);

    const id = uploads[0]!.body.get('id') as string;
    const saved = source({ id, title: 'limits.md', kind: 'upload', status: 'queued' });

    await act(async () => {
      uploads[0]!.resolve(Response.json({ source: saved }, { status: 201 }));
    });

    await waitFor(() => expect(chipTexts()).toEqual(['limits.mdIndexing']));

    db.rows = [{ ...saved, status: 'ready' }, ...db.rows];
    await act(() => queryClient.invalidateQueries({ queryKey: referenceSourcesKey('asst-1') }));

    await waitFor(() => expect(chipTexts()).toEqual(['limits.mdReady']));
  });

  it('says why a file was not attached, and keeps a refused upload as a failed chip', async () => {
    const user = userEvent.setup({ applyAccept: false });

    renderComposer();

    await user.upload(
      screen.getByLabelText('Choose a file to attach'),
      new File(['x'], 'photo.png', { type: 'image/png' }),
    );

    expect(toast.error).toHaveBeenCalledWith(
      'photo.png was not attached. That file type is not supported. Upload PDF, Word, HTML, Markdown or plain text.',
    );
    expect(chipTexts()).toEqual([]);

    await user.upload(
      screen.getByLabelText('Choose a file to attach'),
      new File(['# Big'], 'big.md', { type: 'text/markdown' }),
    );
    await act(async () => {
      uploads[0]!.resolve(
        Response.json(
          {
            error:
              "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.",
          },
          { status: 403 },
        ),
      );
    });

    await waitFor(() => expect(chipTexts()).toEqual(['big.mdFailed']));
    expect(toast.error).toHaveBeenLastCalledWith(
      "big.md could not be uploaded. Your plan's page limit is reached. Upgrade on the Billing page or remove a source.",
    );
    expect(screen.getByTestId('reference-chip')).toHaveAttribute(
      'title',
      "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.",
    );
  });

  it('references a file Knowledge already has instead of uploading it again', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const harbor = source({
      id: 's-harbor',
      title: 'harbor-club.pdf',
      kind: 'upload',
      mime_type: 'application/pdf',
      byte_size: 120,
    });

    db.rows = [harbor, ...db.rows];
    renderComposer({ onSend });
    await waitFor(() =>
      expect(queryClient.getQueryData(referenceSourcesKey('asst-1'))).toBeTruthy(),
    );

    const copy = new File(['x'.repeat(120)], 'harbor-club.pdf', { type: 'application/pdf' });

    await user.upload(screen.getByLabelText('Choose a file to attach'), copy);

    expect(uploads).toHaveLength(0);
    expect(chipTexts()).toEqual(['harbor-club.pdfAlready in Knowledge']);
    expect(screen.getByTestId('reference-chip')).toHaveAttribute(
      'title',
      'harbor-club.pdf is already in Knowledge, so the question reads that file. It was not uploaded again.',
    );

    // Attached again, it is still the one chip.
    await user.upload(screen.getByLabelText('Choose a file to attach'), copy);
    expect(chipTexts()).toEqual(['harbor-club.pdfAlready in Knowledge']);

    await user.type(box(), 'What are the opening hours?{Enter}');
    expect(onSend).toHaveBeenCalledWith('What are the opening hours?', [
      { id: 's-harbor', title: 'harbor-club.pdf', kind: 'upload' },
    ]);
    expect(uploads).toHaveLength(0);
  });

  it('uploads a file whose copy in Knowledge differs in size or failed, and joins an upload in flight', async () => {
    const user = userEvent.setup();

    db.rows = [
      source({ id: 's-old', title: 'harbor-club.pdf', kind: 'upload', byte_size: 99 }),
      source({ id: 's-bad', title: 'rates.pdf', kind: 'upload', byte_size: 50, status: 'failed' }),
    ];
    renderComposer();
    await waitFor(() =>
      expect(queryClient.getQueryData(referenceSourcesKey('asst-1'))).toBeTruthy(),
    );

    const newer = new File(['x'.repeat(120)], 'harbor-club.pdf', { type: 'application/pdf' });
    const rates = new File(['x'.repeat(50)], 'rates.pdf', { type: 'application/pdf' });

    await user.upload(screen.getByLabelText('Choose a file to attach'), [newer, rates]);

    expect(uploads).toHaveLength(2);
    expect(chipTexts()).toEqual(['harbor-club.pdfUploading', 'rates.pdfUploading']);

    // The same file again while it is still uploading: no second upload, no second chip.
    await user.upload(screen.getByLabelText('Choose a file to attach'), newer);
    expect(uploads).toHaveLength(2);
    expect(chipTexts()).toEqual(['harbor-club.pdfUploading', 'rates.pdfUploading']);
  });

  it("starts from the conversation's references and lets one be removed for the next question", async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const refund = { id: 's-refund', title: 'Refund policy', kind: 'text' as const };

    const { rerender } = renderComposer({ onSend, conversationReferences: [refund] });

    await waitFor(() => expect(chipTexts()).toEqual(['Refund policyReady']));
    await user.type(box(), 'And for annual plans?{Enter}');
    expect(onSend).toHaveBeenLastCalledWith('And for annual plans?', [refund]);

    await user.click(screen.getByRole('button', { name: 'Remove Refund policy' }));
    expect(chipTexts()).toEqual([]);

    // The removal holds while the reader types, even though the conversation still has it.
    rerender(
      <QueryClientProvider client={queryClient}>
        <AssistantProvider assistant={ASSISTANT}>
          <ChatComposer draftKey="c1" conversationReferences={[refund]} onSend={onSend} />
        </AssistantProvider>
      </QueryClientProvider>,
    );
    expect(chipTexts()).toEqual([]);

    await user.type(box(), 'Without it?{Enter}');
    expect(onSend).toHaveBeenLastCalledWith('Without it?', []);
  });

  it('keeps unsent chips when the composer remounts for the same conversation', async () => {
    const user = userEvent.setup();
    const first = renderComposer();

    await waitFor(() =>
      expect(queryClient.getQueryData(referenceSourcesKey('asst-1'))).toBeTruthy(),
    );
    await user.type(box(), '@Refund');
    await user.keyboard('{Enter}');
    first.unmount();

    renderComposer();

    expect(chipTexts()).toEqual(['Refund policyReady']);
  });
});
