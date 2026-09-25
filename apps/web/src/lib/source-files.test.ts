import { describe, expect, it } from 'vitest';

import { removeStoredFiles, type StorageClient } from './source-files';

type Entry = { name: string; id: string | null };

/**
 * A bucket held in memory: `list` shows one level like Storage does (folders with a null id),
 * `remove` drops the paths it is given. Options let a test break either call.
 */
const fakeBucket = (
  paths: string[],
  options: { listError?: string; removeError?: string; removeNothing?: boolean } = {},
) => {
  const objects = new Set(paths);
  const calls: { method: 'list' | 'remove'; arg: unknown }[] = [];

  const list = async (folder: string) => {
    calls.push({ method: 'list', arg: folder });

    if (options.listError) {
      return { data: null, error: { message: options.listError } };
    }

    const entries = new Map<string, Entry>();

    for (const path of objects) {
      if (!path.startsWith(`${folder}/`)) {
        continue;
      }

      const rest = path.slice(folder.length + 1);
      const [head, ...tail] = rest.split('/');

      if (head && !entries.has(head)) {
        entries.set(head, { name: head, id: tail.length > 0 ? null : `id-${path}` });
      }
    }

    return { data: [...entries.values()], error: null };
  };

  const remove = async (files: string[]) => {
    calls.push({ method: 'remove', arg: [...files] });

    if (options.removeError) {
      return { data: null, error: { message: options.removeError } };
    }

    if (options.removeNothing) {
      return { data: [], error: null };
    }

    for (const path of files) {
      objects.delete(path);
    }

    return { data: files.map((name) => ({ name })), error: null };
  };

  const client = { storage: { from: () => ({ list, remove }) } } as unknown as StorageClient;

  return { client, objects, calls };
};

const OWNER = '00000000-0000-4000-8000-000000000001';
const A = '11111111-1111-4111-8111-111111111111';
const B = '22222222-2222-4222-8222-222222222222';

describe('removeStoredFiles', () => {
  it('removes the files of one assistant and leaves the rest of the account alone', async () => {
    const bucket = fakeBucket([
      `${OWNER}/${A}/one.md`,
      `${OWNER}/${A}/two.pdf`,
      `${OWNER}/${B}/keep.md`,
    ]);

    const removed = await removeStoredFiles(bucket.client, `${OWNER}/${A}`);

    expect(removed.sort()).toEqual([`${OWNER}/${A}/one.md`, `${OWNER}/${A}/two.pdf`]);
    expect([...bucket.objects]).toEqual([`${OWNER}/${B}/keep.md`]);
  });

  it('walks every assistant folder when given the account folder', async () => {
    const bucket = fakeBucket([
      `${OWNER}/${A}/one.md`,
      `${OWNER}/${B}/two.md`,
      `${OWNER}/${B}/three.docx`,
    ]);

    const removed = await removeStoredFiles(bucket.client, `${OWNER}/`);

    expect(removed).toHaveLength(3);
    expect(bucket.objects.size).toBe(0);
    expect(bucket.calls.filter((call) => call.method === 'remove')).toHaveLength(2);
  });

  it('does nothing for a folder that holds nothing', async () => {
    const bucket = fakeBucket([`${OWNER}/${B}/keep.md`]);

    await expect(removeStoredFiles(bucket.client, `${OWNER}/${A}`)).resolves.toEqual([]);
    expect(bucket.calls.some((call) => call.method === 'remove')).toBe(false);
  });

  it('throws when the listing fails, so the caller does not go on to delete the rows', async () => {
    const bucket = fakeBucket([`${OWNER}/${A}/one.md`], { listError: 'storage is down' });

    await expect(removeStoredFiles(bucket.client, `${OWNER}/${A}`)).rejects.toThrow(
      /storage is down/,
    );
  });

  it('throws when a remove fails or removes nothing instead of looping', async () => {
    const failing = fakeBucket([`${OWNER}/${A}/one.md`], { removeError: 'denied' });
    const silent = fakeBucket([`${OWNER}/${A}/one.md`], { removeNothing: true });

    await expect(removeStoredFiles(failing.client, `${OWNER}/${A}`)).rejects.toThrow(/denied/);
    await expect(removeStoredFiles(silent.client, `${OWNER}/${A}`)).rejects.toThrow(/not removed/);
    expect(silent.calls.filter((call) => call.method === 'remove')).toHaveLength(1);
  });
});
