import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { AddSourceState } from '@/actions/sources';

import { AddSourceDialog, type AddSourceTab } from './add-source-dialog';

const { addSource } = vi.hoisted(() => ({
  addSource: vi.fn<(state: AddSourceState, data: FormData) => Promise<AddSourceState>>(),
}));

vi.mock('@/actions/sources', () => ({ addSource }));

const ASSISTANT = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const renderDialog = (tab: AddSourceTab, onCreated = vi.fn()) => {
  const onTabChange = vi.fn();

  render(
    <AddSourceDialog assistantId={ASSISTANT} open tab={tab} onOpenChange={vi.fn()} onTabChange={onTabChange} onCreated={onCreated} />,
  );

  return { onCreated, onTabChange };
};

describe('AddSourceDialog', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('explains the crawl scope on the website tab and sends the address through the action', async () => {
    const user = userEvent.setup();
    const created = { id: 'src-1', title: 'docs.example.com/guide' };

    addSource.mockResolvedValue({ source: created as never, submittedAt: 1 });

    const { onCreated } = renderDialog('url');
    const dialog = screen.getByRole('dialog', { name: 'Add source' });

    expect(within(dialog).getByText('We follow links under this path.')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Start page'), 'https://docs.example.com/guide/');
    await user.click(within(dialog).getByRole('button', { name: 'Add website' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));

    const form = addSource.mock.calls[0]?.[1];

    expect(form?.get('kind')).toBe('url');
    expect(form?.get('assistantId')).toBe(ASSISTANT);
    expect(form?.get('url')).toBe('https://docs.example.com/guide/');
  });

  it('shows the server\'s reason when the action refuses', async () => {
    const user = userEvent.setup();

    addSource.mockResolvedValue({ error: "Your plan's page limit is reached. Upgrade on the Billing page or remove a source.", submittedAt: 2 });

    renderDialog('sitemap');
    const dialog = screen.getByRole('dialog', { name: 'Add source' });

    await user.type(within(dialog).getByLabelText('Sitemap address'), 'https://docs.example.com/sitemap.xml');
    await user.click(within(dialog).getByRole('button', { name: 'Add sitemap' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent("Your plan's page limit is reached.");
  });

  it('checks the file before uploading, shows its name and size, then posts it as multipart', async () => {
    // The picker's accept attribute would hide the .exe from the handler; the handler must refuse it itself.
    const user = userEvent.setup({ applyAccept: false });
    const created = { id: 'src-2', title: 'manual.md' };

    vi.mocked(fetch).mockResolvedValue(Response.json({ source: created }, { status: 201 }));

    const { onCreated } = renderDialog('upload');
    const dialog = screen.getByRole('dialog', { name: 'Add source' });
    const picker = within(dialog).getByLabelText('Choose file');

    expect(within(dialog).getByRole('button', { name: 'Upload file' })).toBeDisabled();

    await user.upload(picker, new File(['x'], 'tool.exe', { type: 'application/octet-stream' }));
    expect(within(dialog).getByRole('alert')).toHaveTextContent('That file type is not supported.');

    const file = new File(['# Manual\n\nRead me.'], 'manual.md', { type: 'text/markdown' });

    await user.upload(picker, file);

    expect(within(dialog).queryByRole('alert')).not.toBeInTheDocument();
    expect(within(dialog).getByText('manual.md')).toBeInTheDocument();
    expect(within(dialog).getByText(`· ${file.size} B`)).toBeInTheDocument();

    await user.click(within(dialog).getByRole('button', { name: 'Upload file' }));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(created));

    const [url, init] = vi.mocked(fetch).mock.calls[0]!;
    const body = init?.body as FormData;

    expect(url).toBe('/api/sources');
    expect(init?.method).toBe('POST');
    expect(body.get('assistantId')).toBe(ASSISTANT);
    expect((body.get('file') as File).name).toBe('manual.md');
  });

  it('reports an upload the server refused', async () => {
    const user = userEvent.setup();

    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'That file is larger than 25 MB. Split it or pick a smaller one.' }, { status: 400 }));

    renderDialog('upload');
    const dialog = screen.getByRole('dialog', { name: 'Add source' });

    await user.upload(within(dialog).getByLabelText('Choose file'), new File(['x'], 'big.pdf', { type: 'application/pdf' }));
    await user.click(within(dialog).getByRole('button', { name: 'Upload file' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('That file is larger than 25 MB.');
  });
});
