import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddSourceState } from '@/actions/sources';

import { AddSourceDialog, type AddSourceDialogProps, type AddSourceTab } from './add-source-dialog';

const { addSource } = vi.hoisted(() => ({
  addSource: vi.fn<(state: AddSourceState, data: FormData) => Promise<AddSourceState>>(),
}));

vi.mock('@/actions/sources', () => ({ addSource }));

const ASSISTANT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
const OWNER = '00000000-0000-4000-8000-000000000001';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

const renderDialog = (tab: AddSourceTab, overrides: Partial<AddSourceDialogProps> = {}) => {
  const props: AddSourceDialogProps = {
    assistantId: ASSISTANT,
    ownerId: OWNER,
    open: true,
    tab,
    onOpenChange: vi.fn(),
    onTabChange: vi.fn(),
    onPending: vi.fn(),
    onSettled: vi.fn(),
    ...overrides,
  };
  const view = render(<AddSourceDialog {...props} />);

  return { ...props, rerender: (next: Partial<AddSourceDialogProps>) => view.rerender(<AddSourceDialog {...props} {...next} />) };
};

const dialog = () => screen.getByRole('dialog', { name: 'Add source' });

describe('AddSourceDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('draws the website row and closes before the server answers, then hands over the saved row', async () => {
    const user = userEvent.setup();
    let release: (state: AddSourceState) => void = () => {};

    addSource.mockReturnValue(new Promise((resolve) => (release = resolve)));

    const { onPending, onSettled, onOpenChange } = renderDialog('url');

    expect(within(dialog()).getByText('We follow links under this path.')).toBeInTheDocument();

    await user.type(within(dialog()).getByLabelText('Start page'), 'https://docs.example.com/guide/');
    await user.click(within(dialog()).getByRole('button', { name: 'Add website' }));

    // The row and the close happen on the way out, not on the way back.
    expect(onPending).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
    expect(onSettled).not.toHaveBeenCalled();

    const pending = vi.mocked(onPending).mock.calls[0]![0];

    expect(pending).toMatchObject({
      assistant_id: ASSISTANT,
      owner_id: OWNER,
      kind: 'url',
      title: 'docs.example.com/guide',
      uri: 'https://docs.example.com/guide/',
      status: 'queued',
      document_count: 0,
    });
    expect(pending.id).toMatch(UUID);

    const form = addSource.mock.calls[0]![1];

    expect(form.get('kind')).toBe('url');
    expect(form.get('assistantId')).toBe(ASSISTANT);
    expect(form.get('id')).toBe(pending.id);
    expect(form.get('url')).toBe('https://docs.example.com/guide/');
    expect(form.has('title')).toBe(false);

    const saved = { ...pending, title: 'Guide' };

    release({ source: saved });

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(pending.id, saved));
  });

  it('brings the dialog back with the text intact and the reason when the server refuses', async () => {
    const user = userEvent.setup();
    const reason = "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.";

    addSource.mockResolvedValue({ error: reason });

    const { onPending, onSettled, onOpenChange, onTabChange } = renderDialog('text');

    await user.type(within(dialog()).getByLabelText('Title'), 'Refunds');
    await user.type(within(dialog()).getByLabelText('Text'), 'Refunds are issued within 30 days.');
    await user.click(within(dialog()).getByRole('button', { name: 'Add text' }));

    const pending = vi.mocked(onPending).mock.calls[0]![0];

    expect(pending).toMatchObject({ kind: 'text', title: 'Refunds', mime_type: 'text/markdown' });
    expect(pending.byte_size).toBeGreaterThan(0);

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent("Your plan's page limit is reached.");
    expect(onSettled).toHaveBeenCalledWith(pending.id, null);
    expect(onTabChange).toHaveBeenLastCalledWith('text');
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    expect(within(dialog()).getByLabelText('Title')).toHaveValue('Refunds');
    expect(within(dialog()).getByLabelText('Text')).toHaveValue('Refunds are issued within 30 days.');
  });

  it('checks the address itself before drawing anything', async () => {
    const user = userEvent.setup();
    const { onPending } = renderDialog('sitemap');

    await user.type(within(dialog()).getByLabelText('Sitemap address'), 'ftp://docs.example.com/sitemap.xml');
    await user.click(within(dialog()).getByRole('button', { name: 'Add sitemap' }));

    expect(within(dialog()).getByRole('alert')).toHaveTextContent('Enter a full address that starts with http:// or https://.');
    expect(onPending).not.toHaveBeenCalled();
    expect(addSource).not.toHaveBeenCalled();
  });

  it('keeps what was typed while the dialog is closed', async () => {
    const user = userEvent.setup();
    const { rerender } = renderDialog('url');

    await user.type(within(dialog()).getByLabelText('Start page'), 'https://docs.example.com/');

    rerender({ open: false });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    rerender({ open: true });
    expect(within(dialog()).getByLabelText('Start page')).toHaveValue('https://docs.example.com/');
  });

  it('checks the file before uploading, shows its name and size, then posts it as multipart', async () => {
    // The picker's accept attribute would hide the .exe from the handler; the handler must refuse it itself.
    const user = userEvent.setup({ applyAccept: false });
    const created = { id: 'src-2', title: 'manual.md' };

    vi.mocked(fetch).mockResolvedValue(Response.json({ source: created }, { status: 201 }));

    const { onPending, onSettled, onOpenChange } = renderDialog('upload');
    const picker = within(dialog()).getByLabelText('Choose file');

    expect(within(dialog()).getByRole('button', { name: 'Upload file' })).toBeDisabled();

    await user.upload(picker, new File(['x'], 'tool.exe', { type: 'application/octet-stream' }));
    expect(within(dialog()).getByRole('alert')).toHaveTextContent('That file type is not supported.');

    const file = new File(['# Manual\n\nRead me.'], 'manual.md', { type: 'text/markdown' });

    await user.upload(picker, file);

    expect(within(dialog()).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog()).getByText('manual.md')).toBeInTheDocument();
    expect(within(dialog()).getByText(`· ${file.size} B`)).toBeInTheDocument();

    await user.click(within(dialog()).getByRole('button', { name: 'Upload file' }));

    const pending = vi.mocked(onPending).mock.calls[0]![0];

    expect(pending).toMatchObject({ kind: 'upload', title: 'manual.md', mime_type: 'text/markdown', byte_size: file.size });
    expect(pending.storage_path).toMatch(/\.md$/);
    expect(onOpenChange).toHaveBeenCalledWith(false);

    await waitFor(() => expect(onSettled).toHaveBeenCalledWith(pending.id, created));

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = init?.body as FormData;

    expect(url).toBe('/api/sources');
    expect(init?.method).toBe('POST');
    expect(body.get('assistantId')).toBe(ASSISTANT);
    expect(body.get('id')).toBe(pending.id);
    expect((body.get('file') as File).name).toBe('manual.md');
  });

  it('takes the upload row back and shows why when the server refuses it', async () => {
    const user = userEvent.setup();

    vi.mocked(fetch).mockResolvedValue(
      Response.json({ error: 'That file is larger than 25 MB. Split it or pick a smaller one.' }, { status: 400 }),
    );

    const { onPending, onSettled, onTabChange } = renderDialog('upload');

    await user.upload(within(dialog()).getByLabelText('Choose file'), new File(['x'], 'big.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog()).getByRole('button', { name: 'Upload file' }));

    expect(await within(dialog()).findByRole('alert')).toHaveTextContent('That file is larger than 25 MB.');
    expect(onSettled).toHaveBeenCalledWith(vi.mocked(onPending).mock.calls[0]![0].id, null);
    expect(onTabChange).toHaveBeenLastCalledWith('upload');
    // The file is still picked, so a retry is one click away.
    expect(within(dialog()).getByText('big.pdf')).toBeInTheDocument();
  });
});
