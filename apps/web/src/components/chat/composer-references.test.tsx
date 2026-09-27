import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { resetDrafts } from '@/lib/chat/drafts';
import type { ChipStatus, MessageReference, ReferenceOption } from '@/lib/chat/references';

import { Composer } from './composer';

const option = (
  id: string,
  title: string,
  patch: Partial<ReferenceOption> = {},
): ReferenceOption => ({
  id,
  title,
  kind: 'upload',
  status: 'ready',
  detail: 'Markdown file · 1.2 KB',
  createdAt: '2026-09-20T10:00:00Z',
  ...patch,
});

const OPTIONS: ReferenceOption[] = [
  option('s-limits', 'limits.md', { createdAt: '2026-09-26T10:00:00Z' }),
  option('s-refund', 'Refund policy', { kind: 'text', detail: 'Pasted text' }),
  option('s-site', 'Acme docs', {
    kind: 'url',
    detail: 'https://docs.acme.test/',
    status: 'indexing',
  }),
];

/** The composer with its chips held in state, the way the chat composer holds them. */
const Harness = ({
  onSend = vi.fn(),
  onAttach = vi.fn(),
  options = OPTIONS,
  initial = [],
  statuses = {},
}: {
  onSend?: (content: string, references: MessageReference[]) => void;
  onAttach?: (files: File[]) => void;
  /** Null while the list loads. */
  options?: ReferenceOption[] | null;
  initial?: MessageReference[];
  statuses?: Record<string, ChipStatus>;
}) => {
  const [references, setReferences] = useState<MessageReference[]>(initial);

  return (
    <Composer
      draftKey="c1"
      onSend={onSend}
      references={{
        chips: references.map((reference) => ({
          ...reference,
          status: statuses[reference.id] ?? 'ready',
        })),
        onChange: setReferences,
        options: options ?? undefined,
        onAttach,
      }}
    />
  );
};

const box = () => screen.getByRole('textbox', { name: 'Message' });
const picker = () => screen.queryByTestId('reference-picker');
const optionNames = () =>
  within(screen.getByRole('listbox'))
    .getAllByRole('option')
    .map((node) => node.textContent);
const chips = () => screen.queryAllByTestId('reference-chip');

beforeEach(() => {
  resetDrafts();
});

describe('Composer references', () => {
  it('opens the picker on @, filters by what follows, and picks with Enter', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.type(box(), 'What does @');

    expect(picker()).toBeInTheDocument();
    expect(optionNames()).toEqual([
      expect.stringContaining('limits.md'),
      expect.stringContaining('Refund policy'),
      expect.stringContaining('Acme docs'),
    ]);
    // A source still being indexed says so.
    expect(optionNames()[2]).toContain('Indexing');

    await user.type(box(), 'ref');

    expect(optionNames()).toEqual([expect.stringContaining('Refund policy')]);
    expect(box()).toHaveAttribute('aria-activedescendant');

    await user.keyboard('{Enter}');

    expect(picker()).toBeNull();
    expect(chips().map((chip) => chip.textContent)).toEqual([
      expect.stringContaining('Refund policy'),
    ]);
    // The @query leaves the text; the question reads on from where it was.
    expect(box()).toHaveValue('What does ');
    expect(box()).toHaveFocus();
  });

  it('moves with the arrows, wraps around, and picks with Tab', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.type(box(), '@');

    const selected = () =>
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .findIndex((node) => node.getAttribute('aria-selected') === 'true');

    expect(selected()).toBe(0);
    await user.keyboard('{ArrowDown}{ArrowDown}');
    expect(selected()).toBe(2);
    await user.keyboard('{ArrowDown}');
    expect(selected()).toBe(0);
    await user.keyboard('{ArrowUp}');
    expect(selected()).toBe(2);
    await user.keyboard('{Tab}');

    expect(chips().map((chip) => chip.textContent)).toEqual([expect.stringContaining('Acme docs')]);
  });

  it('closes on Esc without sending or losing the text, and opens again for a new @', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();

    render(<Harness onSend={onSend} />);
    await user.type(box(), 'Mail me@');
    // An @ inside a word (an email address) is not a reference.
    expect(picker()).toBeNull();

    await user.type(box(), ' about @lim');
    expect(picker()).toBeInTheDocument();

    await user.keyboard('{Escape}');

    expect(picker()).toBeNull();
    expect(box()).toHaveValue('Mail me@ about @lim');
    expect(onSend).not.toHaveBeenCalled();

    // Enter with the picker closed sends the text as written.
    await user.type(box(), ' and @');
    expect(picker()).toBeInTheDocument();
  });

  it('picks with the mouse and keeps the focus in the box', async () => {
    const user = userEvent.setup();

    render(<Harness />);
    await user.type(box(), 'Explain @');
    await user.click(screen.getByRole('option', { name: /limits\.md/ }));

    expect(chips()).toHaveLength(1);
    expect(box()).toHaveFocus();
    expect(box()).toHaveValue('Explain ');
  });

  it('adds a source once, and marks the ones already added', async () => {
    const user = userEvent.setup();

    render(<Harness initial={[{ id: 's-limits', title: 'limits.md', kind: 'upload' }]} />);
    await user.type(box(), '@lim');

    expect(
      within(screen.getByRole('option', { name: /limits\.md/ })).getByLabelText('Already added'),
    ).toBeInTheDocument();

    await user.keyboard('{Enter}');

    expect(chips()).toHaveLength(1);
  });

  it('says what to do when there is nothing to pick', async () => {
    const user = userEvent.setup();
    const empty = render(<Harness options={[]} />);

    await user.type(box(), '@');
    expect(screen.getByRole('status')).toHaveTextContent(
      'No files or sources yet. Attach a file with the paperclip, or add sources in Knowledge.',
    );
    empty.unmount();
    resetDrafts();

    render(<Harness />);
    await user.type(box(), '@zzz');
    expect(screen.getByRole('status')).toHaveTextContent('Nothing matches “zzz”.');

    // With no match, Enter sends the text as written.
    await user.keyboard('{Enter}');
    expect(box()).toHaveValue('');
  });

  it('shows each chip with its status, removes it, and sends only what can be read', async () => {
    const user = userEvent.setup();
    const onSend = vi.fn();
    const references: MessageReference[] = [
      { id: 'up', title: 'draft.pdf', kind: 'upload' },
      { id: 'ix', title: 'guide.md', kind: 'upload' },
      { id: 'ok', title: 'Refund policy', kind: 'text' },
      { id: 'no', title: 'broken.docx', kind: 'upload' },
      { id: 'gone', title: 'old.md', kind: 'upload' },
    ];

    render(
      <Harness
        onSend={onSend}
        initial={references}
        statuses={{ up: 'uploading', ix: 'indexing', ok: 'ready', no: 'failed', gone: 'missing' }}
      />,
    );

    expect(chips().map((chip) => chip.textContent)).toEqual([
      'draft.pdfUploading',
      'guide.mdIndexing',
      'Refund policyReady',
      'broken.docxFailed',
      'old.mdRemoved',
    ]);

    await user.click(screen.getByRole('button', { name: 'Remove guide.md' }));
    expect(chips()).toHaveLength(4);

    await user.type(box(), 'Summarise these{Enter}');

    expect(onSend).toHaveBeenCalledWith('Summarise these', [
      { id: 'up', title: 'draft.pdf', kind: 'upload' },
      { id: 'ok', title: 'Refund policy', kind: 'text' },
    ]);
  });

  it('attaches files from the paperclip', async () => {
    const user = userEvent.setup();
    const onAttach = vi.fn();

    render(<Harness onAttach={onAttach} />);

    const file = new File(['# Limits'], 'limits.md', { type: 'text/markdown' });

    await user.upload(screen.getByLabelText('Choose a file to attach'), file);

    expect(onAttach).toHaveBeenCalledWith([file]);
    expect(screen.getByRole('button', { name: 'Attach a file' })).toBeEnabled();
  });

  it('shows a loading list while the sources are read', async () => {
    const user = userEvent.setup();

    render(<Harness options={null} />);
    await user.type(box(), '@');

    expect(screen.getByLabelText('Loading sources')).toBeInTheDocument();
  });
});

describe('Composer without references', () => {
  it('has no paperclip and no picker', async () => {
    const user = userEvent.setup();

    render(<Composer draftKey="c2" onSend={vi.fn()} />);
    await user.type(box(), 'Hi @');

    expect(picker()).toBeNull();
    expect(screen.queryByRole('button', { name: 'Attach a file' })).toBeNull();
  });
});
