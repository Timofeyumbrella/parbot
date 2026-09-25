'use client';

import {
  DEFAULT_WIDGET_THEME,
  MAX_ALLOWED_ORIGINS,
  MAX_SUGGESTED_QUESTIONS,
  MAX_WELCOME_MESSAGE_LENGTH,
  WIDGET_ACCENT_PRESETS,
} from '@parbot/shared';
import { cn } from 'cn';
import { Loader2 } from 'lucide-react';
import { useActionState, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { saveWidgetSettings, type WidgetFormState } from '@/actions/widget';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import type { WidgetSettings } from '@/lib/widget-api';

import { PlanGate } from './plan-gate';
import { Segmented } from './segmented';

/** The four plan switches the form needs; the page reads them off the account's plan. */
export type WidgetPlanGates = {
  palette: boolean;
  customTheme: boolean;
  hideBranding: boolean;
  leadCapture: boolean;
};

type WidgetSettingsFormProps = {
  assistantId: string;
  settings: WidgetSettings;
  gates: WidgetPlanGates;
  onSaved?: (settings: WidgetSettings) => void;
};

const initialState: WidgetFormState = { status: 'idle' };

export const WidgetSettingsForm = ({
  assistantId,
  settings,
  gates,
  onSaved,
}: WidgetSettingsFormProps) => {
  const [state, formAction, pending] = useActionState(saveWidgetSettings, initialState);

  // React resets the form after every action. The uncontrolled fields therefore take their
  // defaults from the last outcome: what the visitor typed after a failed save, what the server
  // stored after a good one, and the row itself before either.
  const draft = state.status === 'error' ? state.values : null;
  const saved = state.status === 'saved' ? state.settings : settings;
  // A gated control shows the free value, so what the reader sees matches what the widget does.
  const theme = gates.customTheme ? saved.theme : DEFAULT_WIDGET_THEME;
  const mode = gates.palette ? (draft?.mode ?? saved.mode) : 'bubble';
  const checked = (field: 'hideBranding' | 'leadCapture', allowed: boolean) =>
    allowed && (draft ? draft[field] === 'on' : saved[field]);

  const [accent, setAccent] = useState(theme.accent.toLowerCase());
  const [welcome, setWelcome] = useState(settings.welcomeMessage);
  // Each action result is announced once, however often the parent re-renders around it.
  const announced = useRef<number | null>(null);

  useEffect(() => {
    if (state.status === 'idle' || announced.current === state.at) {
      return;
    }

    announced.current = state.at;

    if (state.status === 'saved') {
      toast.success('Widget settings saved');
      onSaved?.(state.settings);
    } else {
      toast.error(state.error);
    }
  }, [state, onSaved]);

  return (
    <form action={formAction} className="flex min-w-0 flex-col gap-4" aria-busy={pending}>
      <input type="hidden" name="assistantId" value={assistantId} />

      <Card size="sm">
        <CardHeader>
          <CardTitle>Mode</CardTitle>
          <CardDescription>How readers open the assistant on your site.</CardDescription>
          {gates.palette ? null : (
            <CardAction>
              <PlanGate />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          {/* The card title already says Mode; the control keeps the name for screen readers. */}
          <Segmented
            name="mode"
            label="Mode"
            hideLabel
            defaultValue={mode}
            options={[
              { value: 'bubble', label: 'Bubble' },
              { value: 'palette', label: 'Palette (⌘K)', disabled: !gates.palette },
            ]}
            description="Bubble is a round launcher in a corner. Palette opens on ⌘K with the question box on top, the way readers of documentation expect."
          />
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
          <CardDescription>
            {gates.customTheme
              ? 'The accent colours the launcher, the send button and the reader’s own messages.'
              : 'Hobby uses Parbot amber, bottom right, medium corners. Upgrade to change any of it.'}
          </CardDescription>
          {gates.customTheme ? null : (
            <CardAction>
              <PlanGate />
            </CardAction>
          )}
        </CardHeader>
        <CardContent>
          <fieldset disabled={!gates.customTheme} className="grid gap-5 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5 sm:col-span-2">
              <Label htmlFor="accent">Accent colour</Label>
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <input
                    id="accent"
                    name="accent"
                    type="color"
                    value={accent}
                    onChange={(event) => setAccent(event.target.value)}
                    className="border-input h-8 w-10 cursor-pointer rounded-md border bg-transparent p-0.5 disabled:cursor-not-allowed disabled:opacity-50"
                  />
                  <span className="text-muted-foreground font-mono text-xs">{accent}</span>
                </div>
                <div className="flex items-center gap-1.5" role="group" aria-label="Accent presets">
                  {WIDGET_ACCENT_PRESETS.map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setAccent(preset)}
                      aria-label={`Use ${preset}`}
                      aria-pressed={accent === preset}
                      className={cn(
                        'ring-offset-background size-6 rounded-full border border-black/10 transition-shadow disabled:cursor-not-allowed disabled:opacity-50 dark:border-white/15',
                        accent === preset && 'ring-ring ring-2 ring-offset-2',
                      )}
                      style={{ backgroundColor: preset }}
                    />
                  ))}
                </div>
              </div>
            </div>
            <Segmented
              name="scheme"
              label="Colour scheme"
              defaultValue={draft?.scheme ?? theme.scheme}
              options={[
                { value: 'auto', label: 'Auto' },
                { value: 'light', label: 'Light' },
                { value: 'dark', label: 'Dark' },
              ]}
              description="Auto follows the reader’s system setting."
            />
            <Segmented
              name="position"
              label="Position"
              defaultValue={draft?.position ?? theme.position}
              options={[
                { value: 'right', label: 'Bottom right' },
                { value: 'left', label: 'Bottom left' },
              ]}
            />
            <Segmented
              name="radius"
              label="Corner radius"
              defaultValue={draft?.radius ?? theme.radius}
              options={[
                { value: 'sm', label: 'Small' },
                { value: 'md', label: 'Medium' },
                { value: 'lg', label: 'Large' },
              ]}
            />
          </fieldset>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Conversation</CardTitle>
          <CardDescription>The first thing readers see before they ask anything.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="welcomeMessage">Welcome message</Label>
              <span className="text-muted-foreground text-xs tabular-nums" aria-live="polite">
                {welcome.length}/{MAX_WELCOME_MESSAGE_LENGTH}
              </span>
            </div>
            <Textarea
              id="welcomeMessage"
              name="welcomeMessage"
              value={welcome}
              onChange={(event) => setWelcome(event.target.value)}
              maxLength={MAX_WELCOME_MESSAGE_LENGTH}
              rows={2}
              required
              placeholder="Hi. Ask me anything about the docs."
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="suggestedQuestions">Suggested questions</Label>
            <Textarea
              id="suggestedQuestions"
              name="suggestedQuestions"
              defaultValue={draft?.suggestedQuestions ?? saved.suggestedQuestions.join('\n')}
              rows={4}
              placeholder={'How do I create an API key?\nWhat does the free plan include?'}
            />
            <p className="text-muted-foreground text-xs">
              One per line, up to {MAX_SUGGESTED_QUESTIONS}. Shown as chips until the first
              question.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Allowed origins</CardTitle>
          <CardDescription>Which sites may use this assistant’s key.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <Label htmlFor="allowedOrigins" className="sr-only">
            Allowed origins
          </Label>
          <Textarea
            id="allowedOrigins"
            name="allowedOrigins"
            defaultValue={draft?.allowedOrigins ?? saved.allowedOrigins.join('\n')}
            rows={3}
            placeholder={'docs.example.com\n*.example.com'}
            className="font-mono text-xs"
          />
          <p className="text-muted-foreground text-xs">
            Leave empty to allow any site. One per line, up to {MAX_ALLOWED_ORIGINS}: a hostname, a
            full origin such as https://docs.example.com, or *.example.com for every subdomain.
          </p>
        </CardContent>
      </Card>

      <Card size="sm">
        <CardHeader>
          <CardTitle>Branding and leads</CardTitle>
          <CardDescription>What the widget shows around the conversation.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="hideBranding" className="flex-wrap">
                Hide “Powered by Parbot”
                {gates.hideBranding ? null : <PlanGate />}
              </Label>
              <p className="text-muted-foreground text-xs">
                Removes the small line under the composer.
              </p>
            </div>
            <Switch
              id="hideBranding"
              name="hideBranding"
              defaultChecked={checked('hideBranding', gates.hideBranding)}
              disabled={!gates.hideBranding}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-col gap-1">
              <Label htmlFor="leadCapture" className="flex-wrap">
                Lead capture
                {gates.leadCapture ? null : <PlanGate />}
              </Label>
              <p className="text-muted-foreground text-xs">
                When the docs cannot answer, offer to take the reader’s email. Leads land in the
                Inbox.
              </p>
            </div>
            <Switch
              id="leadCapture"
              name="leadCapture"
              defaultChecked={checked('leadCapture', gates.leadCapture)}
              disabled={!gates.leadCapture}
            />
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? <Loader2 className="animate-spin" /> : null}
          Save changes
        </Button>
        {state.status === 'error' ? (
          <p role="alert" className="text-destructive text-sm">
            {state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
};
