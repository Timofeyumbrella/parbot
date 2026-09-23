'use client';

import { createContext, useContext } from 'react';

import type { Assistant } from '@/lib/db';

const AssistantContext = createContext<Assistant | null>(null);

export const AssistantProvider = ({
  assistant,
  children,
}: {
  assistant: Assistant;
  children: React.ReactNode;
}) => <AssistantContext.Provider value={assistant}>{children}</AssistantContext.Provider>;

/** The assistant whose section of the dashboard is open. Only valid under /a/[assistantId]. */
export const useAssistant = () => {
  const assistant = useContext(AssistantContext);

  if (!assistant) {
    throw new Error('useAssistant must be used inside an assistant route.');
  }

  return assistant;
};
