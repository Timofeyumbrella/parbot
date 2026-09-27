import { MAX_PROJECT_SOURCES } from '@/lib/chat/projects';

import type { ReferencedSource } from './references';
import type { ServiceClient } from './retrieval';

/**
 * Projects in the engine. A conversation in a project answers with the project's files, read the
 * way @ references are (their best passages whatever the question's wording), and with the
 * project's instructions in the system prompt. The conversation row says which project it is in,
 * so moving it in or out changes what the next question reads.
 */

export type ProjectContext = {
  id: string;
  name: string;
  instructions: string;
  sources: ReferencedSource[];
};

/** Every source one question reads: the conversation's own references plus the project's files. */
export const MAX_CONTEXT_SOURCES = 20;

const PROJECT_CONTEXT_COLUMNS =
  'id, name, instructions, project_sources(position, sources(id, title, kind, status))';

/**
 * The project with its files in the order they were added, when it is this assistant's; null
 * when it is not (another assistant's, deleted, made up).
 */
export const loadProjectContext = async (
  service: ServiceClient,
  assistantId: string,
  projectId: string,
): Promise<ProjectContext | null> => {
  const { data, error } = await service
    .from('chat_projects')
    .select(PROJECT_CONTEXT_COLUMNS)
    .eq('id', projectId)
    .eq('assistant_id', assistantId)
    .maybeSingle();

  if (error) {
    throw new Error(`The project could not be read: ${error.message}`);
  }

  if (!data) {
    return null;
  }

  const sources = [...data.project_sources]
    .sort((a, b) => a.position - b.position)
    .flatMap((entry) => (entry.sources ? [entry.sources] : []))
    .slice(0, MAX_PROJECT_SOURCES);

  return { id: data.id, name: data.name, instructions: data.instructions, sources };
};

/**
 * The project's context for a question, or null. A failure to read it is logged and the question
 * is answered without it, as with references: an answer from the whole knowledge beats none.
 */
export const resolveProjectContext = async (
  service: ServiceClient,
  assistantId: string,
  projectId: string | null,
): Promise<ProjectContext | null> => {
  if (!projectId) {
    return null;
  }

  try {
    return await loadProjectContext(service, assistantId, projectId);
  } catch (cause) {
    console.error('[engine] the project could not be read', cause);

    return null;
  }
};

/**
 * The sources a question reads: the conversation's own references first (the reader pointed at
 * them for this conversation), then the project's files, each once, up to the cap.
 */
export const mergeContextSources = (
  own: ReferencedSource[],
  project: ReferencedSource[],
  cap = MAX_CONTEXT_SOURCES,
) => {
  const seen = new Set<string>();

  return [...own, ...project]
    .filter((source) => {
      if (seen.has(source.id)) {
        return false;
      }

      seen.add(source.id);

      return true;
    })
    .slice(0, cap);
};
