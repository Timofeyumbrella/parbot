import type { WidgetMode, WidgetScheme } from '@parbot/shared';

import { fetchConfig, findScript, readScriptOptions } from './config';
import { ParbotWidget } from './widget';

/**
 * Reads the embedding <script> tag, loads the assistant's config and mounts the widget. The
 * public API (window.Parbot) works before the widget is ready: calls are replayed once it is.
 */

type Command = (widget: ParbotWidget) => void;

let widget: ParbotWidget | null = null;
let destroyed = false;
const queue: Command[] = [];
/** Stops holding the shortcut for a widget that is still starting. */
let releaseShortcut: (() => void) | null = null;

const run = (command: Command) => {
  if (destroyed) {
    return;
  }

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
export const setScheme = (scheme: WidgetScheme) => run((instance) => instance.setScheme(scheme));
export const ask = (question: string) => run((instance) => instance.ask(question));

/**
 * Takes the widget off the page for good, even if it is still starting. A single-page app that
 * shows it on one screen calls this when the visitor leaves; loading the script again brings it back.
 */
export const destroy = () => {
  destroyed = true;
  releaseShortcut?.();
  widget?.destroy();
  widget = null;
  queue.length = 0;
};

/**
 * Holds ⌘K / Ctrl+K while the config loads. The palette's own listener exists only once the
 * widget mounts, a config round trip after the page is ready, and a press in that window used to
 * be lost. `release` stops listening and says whether the palette should open: the shortcut
 * toggles, so an even number of presses leaves it closed. A script pinned to the bubble never
 * opens a palette, so it leaves the keys alone.
 */
const holdShortcut = (mode: WidgetMode | null) => {
  let pressed = false;
  let listening = mode !== 'bubble';

  const onKeydown = (event: KeyboardEvent) => {
    if (
      (event.metaKey || event.ctrlKey) &&
      typeof event.key === 'string' &&
      event.key.toLowerCase() === 'k'
    ) {
      event.preventDefault();
      pressed = !pressed;
    }
  };

  if (listening) {
    document.addEventListener('keydown', onKeydown);
  }

  return {
    release: () => {
      if (listening) {
        listening = false;
        document.removeEventListener('keydown', onKeydown);
      }

      return pressed;
    },
  };
};

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

  const shortcut = holdShortcut(options.mode);

  releaseShortcut = shortcut.release;

  try {
    const config = await fetchConfig(options.api, options.key, options.version);

    if (!config) {
      console.warn('[Parbot] The widget config was not understood.');

      return null;
    }

    await whenReady();

    if (destroyed || widget || document.getElementById('parbot-widget')) {
      return widget;
    }

    widget = new ParbotWidget({
      key: options.key,
      api: options.api,
      config,
      mode: options.mode,
      launcher: options.launcher,
      scheme: options.scheme,
    }).mount();

    // The widget listens for itself from here; a press while it loaded opens a palette now.
    const pressed = shortcut.release();

    if (options.open) {
      // The preview frame wants the panel visible at once, but must not pull focus away from
      // the settings form the owner is editing next to it.
      widget.open({ focus: false });
    }

    if (pressed && widget.currentMode === 'palette') {
      widget.open();
    }

    for (const command of queue.splice(0)) {
      command(widget);
    }

    return widget;
  } catch (cause) {
    console.warn(
      '[Parbot]',
      cause instanceof Error ? cause.message : 'The widget could not start.',
    );

    return null;
  } finally {
    shortcut.release();

    if (releaseShortcut === shortcut.release) {
      releaseShortcut = null;
    }
  }
};

/** Test hook: forgets the mounted widget so the next boot starts fresh. */
export const resetForTests = () => {
  destroy();
  destroyed = false;
};
