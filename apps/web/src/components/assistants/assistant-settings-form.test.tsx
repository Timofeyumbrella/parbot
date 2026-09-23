import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { FormState } from '@/lib/form';

import { AssistantSettingsForm } from './assistant-settings-form';

const { updateAssistant, toast } = vi.hoisted(() => ({
  updateAssistant: vi.fn<(state: FormState, data: FormData) => Promise<FormState>>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/assistants', () => ({ updateAssistant }));
vi.mock('sonner', () => ({ toast }));

const assistant = {
  id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
  name: 'Acme',
  slug: 'acme',
  description: null,
  instructions: 'Call the product Acme.',
  welcome_message: 'Hi. Ask me about Acme.',
  suggested_questions: ['How do I start?', 'What does it cost?'],
};

describe('AssistantSettingsForm', () => {
  it('shows the saved values, one suggested question per line', () => {
    render(<AssistantSettingsForm assistant={assistant} />);

    expect(screen.getByLabelText('Name')).toHaveValue('Acme');
    expect(screen.getByLabelText('Slug')).toHaveValue('acme');
    expect(screen.getByLabelText('Instructions')).toHaveValue('Call the product Acme.');
    expect(screen.getByLabelText('Welcome message')).toHaveValue('Hi. Ask me about Acme.');
    expect(screen.getByLabelText('Suggested questions')).toHaveValue('How do I start?\nWhat does it cost?');
    expect(screen.getByText(/Appended to the system prompt/)).toBeInTheDocument();
  });

  it('submits the assistant id with the fields and toasts on success', async () => {
    updateAssistant.mockResolvedValue({ status: 'success', message: 'Settings saved.' });
    const user = userEvent.setup();

    render(<AssistantSettingsForm assistant={assistant} />);

    await user.clear(screen.getByLabelText('Name'));
    await user.type(screen.getByLabelText('Name'), 'Acme Cloud');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Settings saved.'));

    const formData = updateAssistant.mock.calls[0]?.[1];

    expect(formData?.get('assistantId')).toBe(assistant.id);
    expect(formData?.get('name')).toBe('Acme Cloud');
    expect(formData?.get('suggestedQuestions')).toBe('How do I start?\nWhat does it cost?');
  });

  it('shows a field error next to the slug', async () => {
    updateAssistant.mockResolvedValue({
      status: 'error',
      error: 'Check the highlighted fields.',
      fieldErrors: { slug: 'Another of your assistants already uses this slug.' },
      values: { slug: 'taken' },
    });
    const user = userEvent.setup();

    render(<AssistantSettingsForm assistant={assistant} />);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    expect(await screen.findByText('Another of your assistants already uses this slug.')).toBeInTheDocument();
    expect(screen.getByLabelText('Slug')).toHaveValue('taken');
    expect(toast.success).not.toHaveBeenCalled();
  });
});
