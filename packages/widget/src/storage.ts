import { UUID_PATTERN, VISITOR_ID_PATTERN } from '@parbot/shared';

/**
 * What the widget remembers between page loads, scoped by public key so two assistants on one
 * site never share a visitor or a thread. Storage can be unavailable (private mode, blocked
 * cookies); every access is guarded and the widget still works for the current page.
 */

export type StoredMessage = {
  role: 'user' | 'assistant';
  text: string;
  citations: { index: number; title: string; url: string | null }[];
  answered?: boolean;
};

export const MAX_STORED_MESSAGES = 40;

const prefix = (key: string) => `parbot:${key}:`;

const read = (name: string) => {
  try {
    return window.localStorage.getItem(name);
  } catch {
    return null;
  }
};

const write = (name: string, value: string | null) => {
  try {
    if (value === null) {
      window.localStorage.removeItem(name);
    } else {
      window.localStorage.setItem(name, value);
    }
  } catch {
    // Storage is blocked; the widget keeps its state in memory for this page only.
  }
};

const randomBytes = (length: number) => {
  const bytes = new Uint8Array(length);

  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(bytes);
  } else {
    for (let index = 0; index < length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256);
    }
  }

  return bytes;
};

const hex = (bytes: Uint8Array) =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');

/** A version 4 UUID, from the platform when it offers one. */
export const uuid = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  const bytes = randomBytes(16);
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const text = hex(bytes);

  return `${text.slice(0, 8)}-${text.slice(8, 12)}-${text.slice(12, 16)}-${text.slice(16, 20)}-${text.slice(20)}`;
};

export const newVisitorId = () => `v_${hex(randomBytes(16))}`;

export const getVisitorId = (key: string) => {
  const name = `${prefix(key)}visitor`;
  const existing = read(name);

  if (existing && VISITOR_ID_PATTERN.test(existing)) {
    return existing;
  }

  const created = newVisitorId();
  write(name, created);

  return created;
};

export const getConversationId = (key: string) => {
  const name = `${prefix(key)}conversation`;
  const existing = read(name);

  if (existing && UUID_PATTERN.test(existing)) {
    return existing;
  }

  const created = uuid();
  write(name, created);

  return created;
};

/** Starts a fresh thread and forgets the old transcript. */
export const resetConversation = (key: string) => {
  const created = uuid();
  write(`${prefix(key)}conversation`, created);
  write(`${prefix(key)}messages`, null);

  return created;
};

export const loadMessages = (key: string): StoredMessage[] => {
  const raw = read(`${prefix(key)}messages`);

  if (!raw) {
    return [];
  }

  try {
    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(
      (item): item is StoredMessage =>
        typeof item === 'object' &&
        item !== null &&
        (item.role === 'user' || item.role === 'assistant') &&
        typeof item.text === 'string' &&
        Array.isArray(item.citations),
    );
  } catch {
    return [];
  }
};

export const saveMessages = (key: string, messages: StoredMessage[]) => {
  write(`${prefix(key)}messages`, JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
};
