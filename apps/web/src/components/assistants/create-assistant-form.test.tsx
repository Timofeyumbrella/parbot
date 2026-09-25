import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FormState } from '@/lib/form';

import { CreateAssistantForm } from './create-assistant-form';

const { createAssistant } = vi.hoisted(() => ({
  createAssistant: vi.fn<(state: FormState, data: FormData) => Promise<FormState>>(),
}));

vi.mock('@/actions/assistants', () => ({ createAssistant }));


afterEach(cleanup);
describe('CreateAssistantForm', () => {
  it('derives the slug from the name until the slug is edited by hand', async () => {
    const user = userEvent.setup();

    render(<CreateAssistantForm />);

    const name = screen.getByLabelText('Name');
    const slug = screen.getByLabelText('Slug');

    await user.type(name, 'Acme Docs');
    expect(slug).toHaveValue('acme-docs');

    await user.clear(slug);
    await user.type(slug, 'acme');
    expect(slug).toHaveValue('acme');

    await user.type(name, ' Two');
    expect(name).toHaveValue('Acme Docs Two');
    expect(slug).toHaveValue('acme');
  });

  it('submits name, slug and description and shows the server message', async () => {
    createAssistant.mockResolvedValue({
      status: 'error',
      error: 'The Hobby plan includes 1 assistant and this account already has 1. Upgrade on the billing page to add another.',
      values: { name: 'Acme Docs', slug: 'acme-docs', description: '' },
    });
    const user = userEvent.setup();

    render(<CreateAssistantForm />);

    await user.type(screen.getByLabelText('Name'), 'Acme Docs');
    await user.click(screen.getByRole('button', { name: 'Create assistant' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('The Hobby plan includes 1 assistant');

    const formData = createAssistant.mock.calls[0]?.[1];

    expect(formData?.get('name')).toBe('Acme Docs');
    expect(formData?.get('slug')).toBe('acme-docs');
    // The onboarding header already says what comes next; the form does not repeat it.
    expect(screen.queryByText(/Next you will/)).toBeNull();
  });
});
