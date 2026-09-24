import type { WidgetMode } from '@parbot/shared';

import { fetchConfig, findScript, readScriptOptions } from './config';
import { ParbotWidget } from './widget';

/**
 * Reads the embedding <script> tag, loads the assistant's config and mounts the widget. The
 * public API (window.Parbot) works before the widget is ready: calls are replayed once it is.
 */

type Command = (widget: ParbotWidget) => void;

let widget: ParbotWidget | null = null;
const queue: Command[] = [];

const run = (command: Command) => {
  if (widget) {
    command(widget);
  } else {
    queue.push(command);
  }
};

export const open = () => run((instance) => instance.open());
export const close = () => run((instance) => instance.close());
export const toggle = () => run((instance) => instance.toggle());
export const setMode = (mode: WidgetMode) => run((instance) => instance.setMode(mode));
export const ask = (question: string) => run((instance) => instance.ask(question));

const whenReady = () =>
  new Promise<void>((resolve) => {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => resolve(), { once: true });
    } else {
      resolve();
    }
  });

export const boot = async (script = findScript()): Promise<ParbotWidget | null> => {
  const options = readScriptOptions(script);

  if (!options) {
    console.warn('[Parbot] The script tag needs a data-parbot="<public key>" attribute.');

    return null;
  }

  try {
    const config = await fetchConfig(options.api, options.key);

    if (!config) {
      console.warn('[Parbot] The widget config was not understood.');

      return null;
    }

    await whenReady();

    if (widget || document.getElementById('parbot-widget')) {
      return widget;
    }

    widget = new ParbotWidget({
      key: options.key,
      api: options.api,
      config,
      mode: options.mode,
      launcher: options.launcher,
    }).mount();

    for (const command of queue.splice(0)) {
      command(widget);
    }

    return widget;
  } catch (cause) {
    console.warn('[Parbot]', cause instanceof Error ? cause.message : 'The widget could not start.');

    return null;
  }
};

/** Test hook: forgets the mounted widget so the next boot starts fresh. */
export const resetForTests = () => {
  widget?.destroy();
  widget = null;
  queue.length = 0;
};
