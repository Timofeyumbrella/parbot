'use client';

import type { WidgetMode } from '@parbot/shared';
import { useState } from 'react';

import type { WidgetSettings } from '@/lib/widget-api';

import { InstallCard } from './install-card';
import { WidgetPreview } from './widget-preview';
import { type WidgetPlanGates, WidgetSettingsForm } from './widget-settings-form';

type WidgetScreenProps = {
  assistantId: string;
  publicKey: string;
  settings: WidgetSettings;
  gates: WidgetPlanGates;
  snippet: string;
  appUrl: string;
  hasSources: boolean;
};

/** The settings form on the left, install snippet and live preview on the right. */
export const WidgetScreen = ({ assistantId, publicKey, settings, gates, snippet, appUrl, hasSources }: WidgetScreenProps) => {
  const [preview, setPreview] = useState<{ mode: WidgetMode; version: number }>({
    mode: gates.palette ? settings.mode : 'bubble',
    version: 0,
  });

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <WidgetSettingsForm
        assistantId={assistantId}
        settings={settings}
        gates={gates}
        onSaved={(saved) => setPreview((current) => ({ mode: saved.mode, version: current.version + 1 }))}
      />
      <div className="flex flex-col gap-4">
        <InstallCard snippet={snippet} />
        <WidgetPreview
          demoPath={`/demo/${publicKey}`}
          demoUrl={`${appUrl}/demo/${publicKey}`}
          mode={preview.mode}
          version={preview.version}
          hasSources={hasSources}
          knowledgeHref={`/a/${assistantId}/knowledge`}
        />
      </div>
    </div>
  );
};
