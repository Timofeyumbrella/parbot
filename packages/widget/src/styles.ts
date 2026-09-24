/**
 * Everything the widget looks like, scoped to its shadow root. Colours come from the scheme
 * (light, dark, or auto following prefers-color-scheme) and the accent from the config.
 */
export const STYLES = `
:host { all: initial; }
*, *::before, *::after { box-sizing: border-box; }

.pb-root {
  --pb-font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
  --pb-mono: ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace;
  --pb-r: 10px;
  --pb-bg: #ffffff;
  --pb-fg: #18181b;
  --pb-muted: #f4f4f5;
  --pb-muted-fg: #6b7280;
  --pb-border: #e4e4e7;
  --pb-bubble: #f4f4f5;
  --pb-code: #f0f0f2;
  --pb-danger: #b91c1c;
  --pb-shadow: 0 12px 40px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  --pb-overlay: rgba(9, 9, 11, 0.45);
  font-family: var(--pb-font);
  font-size: 14px;
  line-height: 1.5;
  color: var(--pb-fg);
  -webkit-font-smoothing: antialiased;
}
.pb-root[data-radius="sm"] { --pb-r: 6px; }
.pb-root[data-radius="lg"] { --pb-r: 16px; }

.pb-root[data-scheme="dark"] {
  --pb-bg: #1c1c21;
  --pb-fg: #ececef;
  --pb-muted: #26262c;
  --pb-muted-fg: #a1a1aa;
  --pb-border: rgba(255, 255, 255, 0.1);
  --pb-bubble: #2a2a31;
  --pb-code: #141418;
  --pb-danger: #f87171;
  --pb-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
  --pb-overlay: rgba(0, 0, 0, 0.6);
}
@media (prefers-color-scheme: dark) {
  .pb-root[data-scheme="auto"] {
    --pb-bg: #1c1c21;
    --pb-fg: #ececef;
    --pb-muted: #26262c;
    --pb-muted-fg: #a1a1aa;
    --pb-border: rgba(255, 255, 255, 0.1);
    --pb-bubble: #2a2a31;
    --pb-code: #141418;
    --pb-danger: #f87171;
    --pb-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 2px 8px rgba(0, 0, 0, 0.3);
    --pb-overlay: rgba(0, 0, 0, 0.6);
  }
}

button, textarea, input { font: inherit; color: inherit; }
button { cursor: pointer; border: 0; background: none; padding: 0; }
button:focus-visible, textarea:focus-visible, input:focus-visible, a:focus-visible {
  outline: 2px solid var(--pb-accent);
  outline-offset: 2px;
}
.pb-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }

/* Launcher */
.pb-launcher {
  position: fixed;
  bottom: 20px;
  z-index: 2147483000;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  background: var(--pb-accent);
  color: var(--pb-on-accent);
  box-shadow: 0 6px 24px rgba(0, 0, 0, 0.22);
  transition: transform 0.15s ease, box-shadow 0.15s ease;
}
.pb-launcher:hover { transform: translateY(-1px); box-shadow: 0 10px 28px rgba(0, 0, 0, 0.26); }
.pb-launcher:active { transform: translateY(0); }
.pb-root[data-position="right"] .pb-launcher { right: 20px; }
.pb-root[data-position="left"] .pb-launcher { left: 20px; }
.pb-launcher.pb-round { width: 52px; height: 52px; border-radius: 999px; }
.pb-launcher.pb-round svg { width: 24px; height: 24px; }
.pb-launcher.pb-pill {
  height: 40px;
  padding: 0 14px 0 12px;
  border-radius: 999px;
  font-weight: 500;
  font-size: 13px;
}
.pb-launcher.pb-pill svg { width: 16px; height: 16px; }
.pb-launcher kbd {
  font-family: var(--pb-font);
  font-size: 11px;
  padding: 1px 6px;
  border-radius: 6px;
  background: rgba(255, 255, 255, 0.22);
  color: inherit;
}

/* Overlay (palette) */
.pb-overlay {
  position: fixed;
  inset: 0;
  z-index: 2147483001;
  background: var(--pb-overlay);
  display: none;
}
.pb-root[data-mode="palette"] .pb-overlay.pb-open { display: block; }

/* Panel */
.pb-panel {
  position: fixed;
  z-index: 2147483002;
  display: none;
  flex-direction: column;
  background: var(--pb-bg);
  color: var(--pb-fg);
  border: 1px solid var(--pb-border);
  border-radius: calc(var(--pb-r) * 1.4);
  box-shadow: var(--pb-shadow);
  overflow: hidden;
}
.pb-panel.pb-open { display: flex; animation: pb-in 0.16s ease-out; }
@keyframes pb-in {
  from { opacity: 0; transform: translateY(8px) scale(0.98); }
  to { opacity: 1; transform: none; }
}
.pb-root[data-mode="bubble"] .pb-panel {
  bottom: 84px;
  width: 380px;
  height: 600px;
  max-height: calc(100vh - 104px);
}
.pb-root[data-mode="bubble"][data-position="right"] .pb-panel { right: 20px; }
.pb-root[data-mode="bubble"][data-position="left"] .pb-panel { left: 20px; }
.pb-root[data-mode="palette"] .pb-panel {
  top: 12vh;
  left: 50%;
  transform: translateX(-50%);
  width: min(640px, calc(100vw - 32px));
  height: min(600px, 76vh);
}
.pb-root[data-mode="palette"] .pb-panel.pb-open { animation: pb-in-centered 0.16s ease-out; }
@keyframes pb-in-centered {
  from { opacity: 0; transform: translateX(-50%) translateY(8px) scale(0.98); }
  to { opacity: 1; transform: translateX(-50%); }
}
@media (max-width: 639px) {
  /* Written with the position attribute so these beat the left/right rules above. */
  .pb-root[data-mode="bubble"] .pb-panel,
  .pb-root[data-mode="bubble"][data-position="right"] .pb-panel,
  .pb-root[data-mode="bubble"][data-position="left"] .pb-panel {
    inset: 0;
    width: auto;
    height: auto;
    max-height: none;
    border-radius: 0;
    border: 0;
  }
  .pb-root[data-mode="bubble"] .pb-panel.pb-open ~ .pb-launcher { display: none; }
  .pb-root[data-mode="palette"] .pb-panel {
    top: 8px;
    width: calc(100vw - 16px);
    height: calc(100vh - 16px);
    height: calc(100dvh - 16px);
  }
}

/* Panel regions. The palette puts the composer above the conversation. */
.pb-header { order: 0; }
.pb-messages { order: 1; }
.pb-composer { order: 2; }
.pb-footer { order: 3; }
.pb-root[data-mode="palette"] .pb-composer { order: 1; border-top: 0; border-bottom: 1px solid var(--pb-border); }
.pb-root[data-mode="palette"] .pb-messages { order: 2; }

.pb-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 10px 10px 14px;
  border-bottom: 1px solid var(--pb-border);
  position: relative;
}
.pb-header .pb-dot { width: 8px; height: 8px; border-radius: 999px; background: var(--pb-accent); flex: none; }
.pb-header .pb-title { font-weight: 600; font-size: 14px; flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pb-icon-btn {
  width: 30px;
  height: 30px;
  border-radius: calc(var(--pb-r) * 0.7);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--pb-muted-fg);
}
.pb-icon-btn:hover { background: var(--pb-muted); color: var(--pb-fg); }
.pb-icon-btn svg { width: 18px; height: 18px; }
.pb-menu {
  position: absolute;
  top: 44px;
  right: 10px;
  min-width: 180px;
  background: var(--pb-bg);
  border: 1px solid var(--pb-border);
  border-radius: calc(var(--pb-r) * 0.8);
  box-shadow: var(--pb-shadow);
  padding: 4px;
  display: none;
  z-index: 2;
}
.pb-menu.pb-open { display: block; }
.pb-menu button {
  display: block;
  width: 100%;
  text-align: left;
  padding: 7px 10px;
  border-radius: calc(var(--pb-r) * 0.6);
  font-size: 13px;
}
.pb-menu button:hover, .pb-menu button:focus-visible { background: var(--pb-muted); outline: none; }

.pb-messages {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overscroll-behavior: contain;
}
.pb-msg {
  max-width: 88%;
  padding: 8px 12px;
  border-radius: var(--pb-r);
  overflow-wrap: anywhere;
}
.pb-msg.pb-user {
  align-self: flex-end;
  background: var(--pb-accent);
  color: var(--pb-on-accent);
  white-space: pre-wrap;
  border-bottom-right-radius: calc(var(--pb-r) * 0.3);
}
.pb-msg.pb-assistant {
  align-self: flex-start;
  background: var(--pb-bubble);
  border-bottom-left-radius: calc(var(--pb-r) * 0.3);
}
.pb-body > :first-child { margin-top: 0; }
.pb-body > :last-child { margin-bottom: 0; }
.pb-body p, .pb-body ul, .pb-body ol, .pb-body pre { margin: 0 0 8px; }
.pb-body ul, .pb-body ol { padding-left: 20px; }
.pb-body li { margin: 2px 0; }
.pb-body .pb-heading { font-weight: 600; }
.pb-body a { color: var(--pb-accent-text); text-decoration: underline; text-underline-offset: 2px; }
.pb-body code {
  font-family: var(--pb-mono);
  font-size: 12.5px;
  background: var(--pb-code);
  padding: 1px 5px;
  border-radius: 5px;
}
.pb-body pre {
  background: var(--pb-code);
  padding: 10px 12px;
  border-radius: calc(var(--pb-r) * 0.7);
  overflow-x: auto;
  font-size: 12.5px;
  line-height: 1.45;
}
.pb-body pre code { background: none; padding: 0; font-size: inherit; }
.pb-body sup.pb-cite {
  font-size: 10px;
  line-height: 0;
  vertical-align: super;
  margin-left: 1px;
  color: var(--pb-accent-text);
  font-weight: 600;
}
.pb-body sup.pb-cite-sep {
  font-size: 10px;
  line-height: 0;
  vertical-align: super;
  color: var(--pb-muted-fg);
}
.pb-caret .pb-body > :last-child::after,
.pb-caret .pb-body:empty::after {
  content: "";
  display: inline-block;
  width: 0.55ch;
  height: 1em;
  margin-left: 0.15ch;
  vertical-align: -0.15em;
  background: currentColor;
  animation: pb-blink 1s steps(2, start) infinite;
}
@keyframes pb-blink { to { visibility: hidden; } }

.pb-sources {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid var(--pb-border);
  font-size: 12px;
  color: var(--pb-muted-fg);
}
.pb-sources .pb-sources-title { font-weight: 600; margin-bottom: 2px; }
.pb-sources ol { margin: 0; padding-left: 18px; }
.pb-sources li { margin: 1px 0; }
.pb-sources a { color: var(--pb-accent-text); text-decoration: none; }
.pb-sources a:hover { text-decoration: underline; }

.pb-error {
  align-self: flex-start;
  max-width: 88%;
  color: var(--pb-danger);
  font-size: 13px;
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}
.pb-error button {
  color: var(--pb-fg);
  font-weight: 500;
  padding: 2px 8px;
  border: 1px solid var(--pb-border);
  border-radius: 999px;
  font-size: 12px;
}
.pb-error button:hover { background: var(--pb-muted); }

.pb-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.pb-chip {
  border: 1px solid var(--pb-border);
  border-radius: 999px;
  padding: 5px 11px;
  font-size: 12.5px;
  color: var(--pb-fg);
  background: var(--pb-bg);
  text-align: left;
}
.pb-chip:hover { border-color: var(--pb-accent); background: var(--pb-muted); }

.pb-lead {
  align-self: stretch;
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-r);
  padding: 10px 12px;
  display: flex;
  flex-direction: column;
  gap: 8px;
  font-size: 13px;
}
.pb-lead p { margin: 0; }
.pb-lead input, .pb-lead textarea {
  width: 100%;
  border: 1px solid var(--pb-border);
  border-radius: calc(var(--pb-r) * 0.7);
  padding: 7px 9px;
  background: var(--pb-bg);
  font-size: 13px;
  resize: vertical;
}
.pb-lead .pb-row { display: flex; gap: 8px; align-items: center; justify-content: flex-end; }
.pb-lead .pb-hint { color: var(--pb-muted-fg); font-size: 12px; margin-right: auto; }
.pb-btn {
  background: var(--pb-accent);
  color: var(--pb-on-accent);
  padding: 6px 12px;
  border-radius: calc(var(--pb-r) * 0.7);
  font-weight: 500;
  font-size: 13px;
}
.pb-btn:disabled { opacity: 0.6; cursor: default; }
.pb-btn.pb-ghost { background: none; color: var(--pb-muted-fg); }
.pb-btn.pb-ghost:hover { color: var(--pb-fg); }
.pb-thanks { align-self: flex-start; color: var(--pb-muted-fg); font-size: 13px; }

.pb-composer {
  display: flex;
  align-items: flex-end;
  gap: 8px;
  padding: 10px 12px;
  border-top: 1px solid var(--pb-border);
}
.pb-composer textarea {
  flex: 1;
  min-width: 0;
  resize: none;
  border: 1px solid var(--pb-border);
  border-radius: var(--pb-r);
  background: var(--pb-bg);
  padding: 8px 10px;
  min-height: 38px;
  max-height: 120px;
  line-height: 1.4;
  font-size: 14px;
}
.pb-composer textarea::placeholder { color: var(--pb-muted-fg); }
.pb-root[data-mode="palette"] .pb-composer textarea { border: 0; font-size: 15px; padding-left: 4px; }
.pb-root[data-mode="palette"] .pb-composer .pb-search { color: var(--pb-muted-fg); align-self: center; display: inline-flex; }
.pb-root[data-mode="palette"] .pb-composer .pb-search svg { width: 18px; height: 18px; }
.pb-root[data-mode="bubble"] .pb-composer .pb-search { display: none; }
.pb-send {
  width: 36px;
  height: 36px;
  flex: none;
  border-radius: calc(var(--pb-r) * 0.8);
  background: var(--pb-accent);
  color: var(--pb-on-accent);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.pb-send:disabled { opacity: 0.5; cursor: default; }
.pb-send svg { width: 18px; height: 18px; }

.pb-footer {
  text-align: center;
  font-size: 11px;
  color: var(--pb-muted-fg);
  padding: 6px 12px 8px;
}
.pb-footer a { color: inherit; text-decoration: none; }
.pb-footer a:hover { color: var(--pb-fg); }
.pb-footer.pb-hidden { display: none; }

@media (prefers-reduced-motion: reduce) {
  .pb-panel.pb-open, .pb-root[data-mode="palette"] .pb-panel.pb-open { animation: none; }
  .pb-launcher { transition: none; }
  .pb-caret .pb-body > :last-child::after, .pb-caret .pb-body:empty::after { animation: none; }
}
`;
