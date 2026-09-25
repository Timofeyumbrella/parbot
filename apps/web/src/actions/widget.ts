'use server';

import { UUID_PATTERN } from '@parbot/shared';
import { revalidatePath } from 'next/cache';

import { getAccountPlan } from '@/lib/account';
import { requireUser } from '@/lib/session';
import {
  gateWidgetSettings,
  parseWidgetSettings,
  widgetFormValues,
  type WidgetFormValues,
  type WidgetSettings,
} from '@/lib/widget-api';

export type WidgetFormState =
  | { status: 'idle' }
  | { status: 'saved'; at: number; settings: WidgetSettings }
  | { status: 'error'; at: number; error: string; values: WidgetFormValues };

/**
 * Saves the widget settings of an assistant the visitor owns. The plan gates are checked here
 * as well as in the form, so a disabled control cannot be re-enabled from the browser. A failed
 * save hands the typed values back, because React resets the form once the action returns.
 */
export const saveWidgetSettings = async (
  _previous: WidgetFormState,
  formData: FormData,
): Promise<WidgetFormState> => {
  const values = widgetFormValues(formData);
  const failure = (error: string): WidgetFormState => ({
    status: 'error',
    at: Date.now(),
    error,
    values,
  });

  const { supabase, user } = await requireUser();
  const assistantId = formData.get('assistantId');

  if (typeof assistantId !== 'string' || !UUID_PATTERN.test(assistantId)) {
    return failure('That assistant could not be found.');
  }

  const parsed = parseWidgetSettings(formData);

  if (!parsed.success) {
    return failure(parsed.error);
  }

  const { plan } = await getAccountPlan();
  const gate = gateWidgetSettings(parsed.data, plan);

  if (gate) {
    return failure(gate);
  }

  const settings = parsed.data;
  // Row level security limits the update to the visitor's own rows; the owner filter makes
  // that explicit so a foreign id updates nothing and reads as not found.
  const { data, error } = await supabase
    .from('assistants')
    .update({
      mode: settings.mode,
      theme: settings.theme,
      welcome_message: settings.welcomeMessage,
      suggested_questions: settings.suggestedQuestions,
      allowed_origins: settings.allowedOrigins,
      hide_branding: settings.hideBranding,
      lead_capture: settings.leadCapture,
    })
    .eq('id', assistantId)
    .eq('owner_id', user.id)
    .select('id')
    .maybeSingle();

  if (error) {
    return failure('The settings could not be saved. Try again.');
  }

  if (!data) {
    return failure('That assistant could not be found.');
  }

  revalidatePath(`/a/${assistantId}/widget`);

  return { status: 'saved', at: Date.now(), settings };
};
