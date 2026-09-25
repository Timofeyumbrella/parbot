'use client';

import {
  type Citation,
  MAX_MESSAGE_LENGTH,
  readChatStream,
  type WidgetChatRequest,
  type WidgetConfig,
} from '@parbot/shared';
import { RotateCcw, SendHorizontal } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { AnswerMarkdown } from './answer-markdown';
import { AssistantTurn, DemoWindow, ThinkingDots, UserBubble } from './demo-window';

type LiveConfig = Pick<WidgetConfig, 'name' | 'welcomeMessage' | 'suggestedQuestions'>;

type Turn =
  | { id: string; role: 'user'; content: string }
  | {
      id: string;
      role: 'assistant';
      content: string;
      citations: Citation[];
      status: 'streaming' | 'done' | 'error';
    };

const FALLBACK_CONFIG: LiveConfig = {
  name: 'Parbot',
  welcomeMessage: 'Ask anything about the documentation.',
  suggestedQuestions: [],
};

const OFFLINE_TEXT = 'Could not reach the assistant. Check your connection and try again.';
const EMPTY_TEXT = 'The answer did not arrive. Try again.';

/** Matches VISITOR_ID_PATTERN: a prefix plus 24 hex characters. Lives for this page load only. */
const makeVisitorId = () =>
  `visitor_${Array.from(crypto.getRandomValues(new Uint8Array(12)), (byte) => byte.toString(16).padStart(2, '0')).join('')}`;

const readErrorMessage = async (response: Response) => {
  try {
    const body = (await response.json()) as { message?: unknown; error?: unknown };

    if (typeof body.message === 'string') {
      return body.message;
    }

    if (typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    // Not JSON; fall through to the status line.
  }

  return `The assistant could not answer (${response.status}).`;
};

const parseConfig = (value: unknown): LiveConfig | null => {
  if (!value || typeof value !== 'object') {
    return null;
  }

  const config = value as Record<string, unknown>;

  if (typeof config.name !== 'string') {
    return null;
  }

  return {
    name: config.name,
    welcomeMessage:
      typeof config.welcomeMessage === 'string' && config.welcomeMessage.trim()
        ? config.welcomeMessage
        : FALLBACK_CONFIG.welcomeMessage,
    suggestedQuestions: Array.isArray(config.suggestedQuestions)
      ? config.suggestedQuestions
          .filter((item): item is string => typeof item === 'string')
          .slice(0, 3)
      : [],
  };
};

/**
 * Talks to the same endpoint the widget uses, so visitors get real streamed answers with
 * citations from the demo assistant. Ids are generated in the browser and kept for the page
 * load, so follow-up questions land in the same conversation.
 */
export const LiveDemo = ({ demoKey }: { demoKey: string }) => {
  const [config, setConfig] = useState<LiveConfig>(FALLBACK_CONFIG);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const inputId = useId();
  const session = useRef<{ visitorId: string; conversationId: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  /** Aborts the config fetch and any answer still streaming when the panel unmounts. */
  const unmounted = useRef<AbortController>(null);

  useEffect(() => {
    const controller = new AbortController();

    unmounted.current = controller;

    fetch(`/api/widget/config?key=${encodeURIComponent(demoKey)}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((json) => {
        const parsed = parseConfig(json);

        if (parsed) {
          setConfig(parsed);
        }
      })
      .catch(() => {
        // The fallback copy is fine when the config cannot be read.
      });

    return () => controller.abort();
  }, [demoKey]);

  useEffect(() => {
    const body = bodyRef.current;

    if (body) {
      body.scrollTop = body.scrollHeight;
    }
  }, [turns]);

  const ask = async (question: string) => {
    const message = question.trim().slice(0, MAX_MESSAGE_LENGTH);

    if (!message || busy) {
      return;
    }

    session.current ??= { visitorId: makeVisitorId(), conversationId: crypto.randomUUID() };

    const assistantId = crypto.randomUUID();
    const patch = (update: Partial<Extract<Turn, { role: 'assistant' }>>) =>
      setTurns((previous) =>
        previous.map((turn) =>
          turn.id === assistantId && turn.role === 'assistant' ? { ...turn, ...update } : turn,
        ),
      );
    const fail = (content: string) => patch({ content, status: 'error' });

    setDraft('');
    setBusy(true);
    setTurns((previous) => [
      ...previous,
      { id: crypto.randomUUID(), role: 'user', content: message },
      { id: assistantId, role: 'assistant', content: '', citations: [], status: 'streaming' },
    ]);

    try {
      const body: WidgetChatRequest = {
        key: demoKey,
        visitorId: session.current.visitorId,
        conversationId: session.current.conversationId,
        message,
        pageUrl: window.location.href,
      };
      const response = await fetch('/api/widget/chat', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: unmounted.current?.signal,
      });

      if (!response.ok && !response.headers.get('content-type')?.includes('text/event-stream')) {
        fail(await readErrorMessage(response));

        return;
      }

      let content = '';
      let finished = false;

      for await (const event of readChatStream(response)) {
        if (event.type === 'token') {
          content += event.text;
          patch({ content });
        } else if (event.type === 'citations') {
          patch({ citations: event.citations });
        } else if (event.type === 'done') {
          finished = true;
          patch({ status: 'done' });
        } else if (event.type === 'error') {
          fail(event.message);

          return;
        }
      }

      if (!finished) {
        patch(content ? { status: 'done' } : { content: EMPTY_TEXT, status: 'error' });
      }
    } catch {
      if (!unmounted.current?.signal.aborted) {
        fail(OFFLINE_TEXT);
      }
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  };

  const lastQuestion = [...turns].reverse().find((turn) => turn.role === 'user')?.content;

  return (
    <DemoWindow
      label="Live"
      title={config.name}
      bodyRef={bodyRef}
      ariaBusy={busy}
      footer={
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            void ask(draft);
          }}
        >
          <label htmlFor={inputId} className="sr-only">
            Ask a question
          </label>
          <Input
            ref={inputRef}
            id={inputId}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Ask a question about the docs"
            maxLength={MAX_MESSAGE_LENGTH}
            autoComplete="off"
            disabled={busy}
            className="bg-background h-9 px-3"
          />
          <Button type="submit" size="icon-lg" aria-label="Send" disabled={busy || !draft.trim()}>
            <SendHorizontal />
          </Button>
        </form>
      }
    >
      {turns.length === 0 ? (
        <>
          <AssistantTurn>
            <p>{config.welcomeMessage}</p>
          </AssistantTurn>
          {config.suggestedQuestions.length > 0 ? (
            <ul className="ml-9 flex flex-wrap gap-1.5" aria-label="Suggested questions">
              {config.suggestedQuestions.map((question) => (
                <li key={question}>
                  <button
                    type="button"
                    onClick={() => void ask(question)}
                    className="bg-background hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-3 rounded-md border px-2 py-1 text-left text-xs outline-none transition-colors"
                  >
                    {question}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </>
      ) : (
        turns.map((turn) =>
          turn.role === 'user' ? (
            <UserBubble key={turn.id}>{turn.content}</UserBubble>
          ) : (
            <AssistantTurn
              key={turn.id}
              streaming={turn.status === 'streaming' && turn.content.length > 0}
              citations={turn.citations}
              tone={turn.status === 'error' ? 'error' : 'default'}
            >
              {turn.status === 'streaming' && !turn.content ? (
                <ThinkingDots />
              ) : turn.status === 'error' ? (
                <div className="flex flex-col items-start gap-2">
                  <p>{turn.content}</p>
                  {lastQuestion ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void ask(lastQuestion)}
                      disabled={busy}
                    >
                      <RotateCcw data-icon="inline-start" />
                      Try again
                    </Button>
                  ) : null}
                </div>
              ) : (
                <AnswerMarkdown content={turn.content} citations={turn.citations} />
              )}
            </AssistantTurn>
          ),
        )
      )}
    </DemoWindow>
  );
};
