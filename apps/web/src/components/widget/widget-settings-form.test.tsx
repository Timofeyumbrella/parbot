import { DEFAULT_WIDGET_THEME } from '@parbot/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { WidgetFormState } from '@/actions/widget';
import type { WidgetSettings } from '@/lib/widget-api';

import { WidgetSettingsForm } from './widget-settings-form';

const { saveWidgetSettings, toast } = vi.hoisted(() => ({
  saveWidgetSettings: vi.fn<(state: WidgetFormState, data: FormData) => Promise<WidgetFormState>>(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/actions/widget', () => ({ saveWidgetSettings }));
vi.mock('sonner', () => ({ toast }));

const ASSISTANT_ID = '3fa85f64-5717-4562-b3fc-2c963f66afa6';

const settings: WidgetSettings = {
  mode: 'palette',
  theme: { scheme: 'dark', accent: '#2563eb', position: 'left', radius: 'lg' },
  welcomeMessage: 'Ask me about Acme.',
  suggestedQuestions: ['How do I start?', 'What does it cost?'],
  allowedOrigins: ['docs.acme.dev', '*.acme.dev'],
  hideBranding: true,
  leadCapture: true,
};

const hobby = { palette: false, customTheme: false, hideBranding: false, leadCapture: false };
const starter = { palette: true, customTheme: true, hideBranding: true, leadCapture: true };

describe('WidgetSettingsForm', () => {
  it('shows the saved values on a paid plan with every control enabled', () => {
    render(<WidgetSettingsForm assistantId={ASSISTANT_ID} settings={settings} gates={starter} />);

    expect(screen.getByRole('radio', { name: 'Palette (⌘K)' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Palette (⌘K)' })).toBeEnabled();
    expect(screen.getByRole('radio', { name: 'Dark' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bottom left' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Large' })).toBeChecked();
    expect(screen.getByLabelText('Accent colour')).toHaveValue('#2563eb');
    expect(screen.getByLabelText('Welcome message')).toHaveValue('Ask me about Acme.');
    expect(screen.getByLabelText('Suggested questions')).toHaveValue(
      'How do I start?\nWhat does it cost?',
    );
    expect(screen.getByLabelText('Allowed origins')).toHaveValue('docs.acme.dev\n*.acme.dev');
    expect(screen.getByRole('switch', { name: /Hide/ })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Lead capture/ })).toBeChecked();
    expect(screen.queryByRole('link', { name: 'Starter and up' })).not.toBeInTheDocument();
  });

  it('shows Mode once, as the card title, and keeps it as the name of the control', () => {
    for (const gates of [starter, hobby]) {
      const { unmount } = render(
        <WidgetSettingsForm assistantId={ASSISTANT_ID} settings={settings} gates={gates} />,
      );

      const visible = screen.getAllByText('Mode').filter((node) => !node.closest('.sr-only'));
      expect(visible).toHaveLength(1);
      expect(
        within(screen.getByRole('group', { name: 'Mode' })).getByRole('radio', { name: 'Bubble' }),
      ).toBeInTheDocument();

      unmount();
    }
  });

  it('disables the gated controls on Hobby, shows the free values and links each gate to billing', () => {
    render(<WidgetSettingsForm assistantId={ASSISTANT_ID} settings={settings} gates={hobby} />);

    expect(screen.getByRole('radio', { name: 'Palette (⌘K)' })).toBeDisabled();
    expect(screen.getByRole('radio', { name: 'Bubble' })).toBeChecked();
    expect(screen.getByLabelText('Accent colour')).toBeDisabled();
    expect(screen.getByLabelText('Accent colour')).toHaveValue(DEFAULT_WIDGET_THEME.accent);
    expect(screen.getByRole('radio', { name: 'Auto' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bottom right' })).toBeChecked();
    expect(screen.getByRole('switch', { name: /Hide/ })).toBeDisabled();
    expect(screen.getByRole('switch', { name: /Hide/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Lead capture/ })).toBeDisabled();

    const gates = screen.getAllByRole('link', { name: 'Starter and up' });
    expect(gates).toHaveLength(4);

    for (const gate of gates) {
      expect(gate).toHaveAttribute('href', '/billing');
    }

    // The free fields still work.
    expect(screen.getByLabelText('Welcome message')).toBeEnabled();
    expect(screen.getByLabelText('Allowed origins')).toBeEnabled();
    expect(screen.getByText(/Leave empty to allow any site/)).toBeInTheDocument();
  });

  it('submits the assistant id with the fields, toasts and reports the saved settings', async () => {
    const saved: WidgetSettings = { ...settings, welcomeMessage: 'Hello from Acme.' };
    saveWidgetSettings.mockResolvedValue({
      status: 'saved',
      at: 1,
      settings: saved,
      version: 'mv1',
    });
    const onSaved = vi.fn();
    const user = userEvent.setup();

    render(
      <WidgetSettingsForm
        assistantId={ASSISTANT_ID}
        settings={settings}
        gates={starter}
        onSaved={onSaved}
      />,
    );

    await user.clear(screen.getByLabelText('Welcome message'));
    await user.type(screen.getByLabelText('Welcome message'), 'Hello from Acme.');
    await user.click(screen.getByRole('button', { name: 'Use #16a34a' }));
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledWith('Widget settings saved'));
    expect(onSaved).toHaveBeenCalledWith(saved, 'mv1');

    const formData = saveWidgetSettings.mock.calls[0]?.[1];
    expect(formData?.get('assistantId')).toBe(ASSISTANT_ID);
    expect(formData?.get('mode')).toBe('palette');
    expect(formData?.get('accent')).toBe('#16a34a');
    expect(formData?.get('welcomeMessage')).toBe('Hello from Acme.');
    expect(formData?.get('suggestedQuestions')).toBe('How do I start?\nWhat does it cost?');
    expect(formData?.get('allowedOrigins')).toBe('docs.acme.dev\n*.acme.dev');
    expect(formData?.get('hideBranding')).toBe('on');
    expect(formData?.get('leadCapture')).toBe('on');
  });

  it('keeps the switches and the other fields at the saved values across two saves', async () => {
    // The server echoes what it stored, the way the action does.
    saveWidgetSettings.mockImplementation(async (_state, data) => ({
      status: 'saved',
      at: saveWidgetSettings.mock.calls.length,
      version: `v${saveWidgetSettings.mock.calls.length}`,
      settings: {
        mode: data.get('mode') === 'palette' ? 'palette' : 'bubble',
        theme: {
          scheme: data.get('scheme') as WidgetSettings['theme']['scheme'],
          accent: String(data.get('accent')),
          position: data.get('position') as WidgetSettings['theme']['position'],
          radius: data.get('radius') as WidgetSettings['theme']['radius'],
        },
        welcomeMessage: String(data.get('welcomeMessage')).trim(),
        suggestedQuestions: String(data.get('suggestedQuestions')).split('\n').filter(Boolean),
        allowedOrigins: String(data.get('allowedOrigins')).split('\n').filter(Boolean),
        hideBranding: data.get('hideBranding') === 'on',
        leadCapture: data.get('leadCapture') === 'on',
      },
    }));
    const user = userEvent.setup();

    render(<WidgetSettingsForm assistantId={ASSISTANT_ID} settings={settings} gates={starter} />);

    const hide = () => screen.getByRole('switch', { name: /Hide/ });
    const lead = () => screen.getByRole('switch', { name: /Lead capture/ });

    await user.click(hide());
    await user.click(lead());
    await user.click(screen.getByRole('radio', { name: 'Bubble' }));
    await user.click(screen.getByRole('radio', { name: 'Light' }));
    await user.type(screen.getByLabelText('Welcome message'), '  ');
    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(saveWidgetSettings).toHaveBeenCalledTimes(1));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(1));

    const first = saveWidgetSettings.mock.calls[0]?.[1];
    expect(first?.get('hideBranding')).toBeNull();
    expect(first?.get('leadCapture')).toBeNull();

    // What the page shows after the save is what was stored, not what the page loaded with.
    expect(hide()).not.toBeChecked();
    expect(lead()).not.toBeChecked();
    expect(screen.getByRole('radio', { name: 'Bubble' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByLabelText('Welcome message')).toHaveValue('Ask me about Acme.');

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(2));

    // A second save sends the stored values again instead of the page-load ones.
    const second = saveWidgetSettings.mock.calls[1]?.[1];
    expect(second?.get('hideBranding')).toBeNull();
    expect(second?.get('leadCapture')).toBeNull();
    expect(second?.get('mode')).toBe('bubble');
    expect(second?.get('scheme')).toBe('light');
    expect(hide()).not.toBeChecked();
    expect(lead()).not.toBeChecked();

    // Turning one back on and saving shows it on, and the save after that keeps it on.
    await user.click(lead());
    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(3));
    expect(lead()).toBeChecked();

    await user.click(screen.getByRole('button', { name: 'Save changes' }));
    await vi.waitFor(() => expect(toast.success).toHaveBeenCalledTimes(4));
    expect(saveWidgetSettings.mock.calls[3]?.[1]?.get('leadCapture')).toBe('on');
    expect(lead()).toBeChecked();
    expect(hide()).not.toBeChecked();
  });

  it('keeps what was typed after a failed save and shows the reason', async () => {
    saveWidgetSettings.mockResolvedValue({
      status: 'error',
      at: 2,
      error: 'List at most 4 suggested questions.',
      values: {
        mode: 'bubble',
        scheme: 'light',
        position: 'right',
        radius: 'sm',
        suggestedQuestions: '1\n2\n3\n4\n5',
        allowedOrigins: 'one.example',
        welcomeMessage: 'Typed but not saved.',
        leadCapture: 'on',
      },
    });
    const user = userEvent.setup();

    render(<WidgetSettingsForm assistantId={ASSISTANT_ID} settings={settings} gates={starter} />);

    await user.click(screen.getByRole('button', { name: 'Save changes' }));

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('List at most 4 suggested questions.');
    expect(toast.error).toHaveBeenCalledWith('List at most 4 suggested questions.');

    expect(screen.getByLabelText('Suggested questions')).toHaveValue('1\n2\n3\n4\n5');
    expect(screen.getByLabelText('Allowed origins')).toHaveValue('one.example');
    expect(screen.getByRole('radio', { name: 'Bubble' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Light' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Small' })).toBeChecked();
    expect(screen.getByLabelText('Welcome message')).toHaveValue('Typed but not saved.');
    // The switches show what was sent, not the row: branding went off, lead capture stayed on.
    expect(screen.getByRole('switch', { name: /Hide/ })).not.toBeChecked();
    expect(screen.getByRole('switch', { name: /Lead capture/ })).toBeChecked();
    expect(
      within(screen.getByRole('group', { name: 'Accent presets' })).getAllByRole('button'),
    ).toHaveLength(6);
  });
});
