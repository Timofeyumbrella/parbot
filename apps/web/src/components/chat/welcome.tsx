'use client';

import type { Assistant } from '@/lib/db';

type WelcomeProps = {
  assistant: Pick<Assistant, 'name' | 'welcome_message' | 'suggested_questions'>;
  onPick: (question: string) => void;
  disabled?: boolean;
};

/**
 * What an empty conversation shows: who is answering, the welcome line, and questions to start from.
 * The pane is empty, so a long question wraps instead of ending in an ellipsis.
 */
export const Welcome = ({ assistant, onPick, disabled = false }: WelcomeProps) => (
  <div className="flex flex-col items-center gap-4 text-center" data-testid="welcome">
    <span className="bg-primary size-2.5 rounded-full" aria-hidden="true" />
    <div className="flex flex-col gap-1.5">
      <h1 className="text-lg font-semibold tracking-tight">{assistant.name}</h1>
      <p className="text-muted-foreground text-pretty-balance max-w-md text-sm">
        {assistant.welcome_message}
      </p>
    </div>
    {assistant.suggested_questions.length > 0 ? (
      <ul
        className="mt-1 flex max-w-full flex-wrap justify-center gap-2"
        aria-label="Suggested questions"
      >
        {assistant.suggested_questions.map((question) => (
          <li key={question} className="max-w-full">
            <button
              type="button"
              disabled={disabled}
              onClick={() => onPick(question)}
              className="bg-card hover:bg-muted focus-visible:ring-ring/50 focus-visible:ring-3 min-h-8 max-w-full rounded-full border px-3.5 py-1.5 text-left text-sm transition-colors focus-visible:outline-none disabled:opacity-50"
            >
              {question}
            </button>
          </li>
        ))}
      </ul>
    ) : (
      <p className="text-muted-foreground text-xs">Ask anything the documentation covers.</p>
    )}
  </div>
);
