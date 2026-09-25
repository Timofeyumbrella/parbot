import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/lib/db';
import { STORAGE_BUCKET } from '@/lib/ingest';

/** More than any assistant or account holds; a listing this size means the loop must stop. */
const PAGE_SIZE = 1000;
const MAX_PASSES = 100;

export type StorageClient = Pick<SupabaseClient<Database>, 'storage'>;

/**
 * Removes every uploaded or pasted file under a folder of the sources bucket: one assistant's
 * (`<owner_id>/<assistant_id>`) or one account's (`<owner_id>`). The row cascade cannot do it,
 * because storage.objects has no foreign key to assistants, so without this a deleted assistant
 * or account keeps its customers' documents on disk. Folders are walked because an account's
 * folder holds one folder per assistant. Returns the paths it removed.
 */
export const removeStoredFiles = async (
  client: StorageClient,
  folder: string,
): Promise<string[]> => {
  const bucket = client.storage.from(STORAGE_BUCKET);
  const root = folder.replace(/\/+$/, '');
  const folders = [root];
  const seen = new Set(folders);
  const removed: string[] = [];

  while (folders.length > 0) {
    const current = folders.pop()!;

    // Removing shifts the listing, so each pass reads from the start until only folders remain.
    for (let pass = 0; ; pass += 1) {
      if (pass === MAX_PASSES) {
        throw new Error(`Too many files under ${current} to remove in one go.`);
      }

      const { data, error } = await bucket.list(current, { limit: PAGE_SIZE });

      if (error) {
        throw new Error(`Listing ${current} failed: ${error.message}`);
      }

      const files: string[] = [];

      for (const entry of data ?? []) {
        const path = `${current}/${entry.name}`;

        if (entry.id === null) {
          if (!seen.has(path)) {
            seen.add(path);
            folders.push(path);
          }
        } else {
          files.push(path);
        }
      }

      if (files.length === 0) {
        break;
      }

      const { data: gone, error: removeError } = await bucket.remove(files);

      if (removeError) {
        throw new Error(`Removing the files under ${current} failed: ${removeError.message}`);
      }

      // A remove that touches nothing would loop forever; a client without the right to delete
      // reports success with an empty list.
      if (!gone || gone.length === 0) {
        throw new Error(`The files under ${current} were listed but not removed.`);
      }

      removed.push(...files);
    }
  }

  return removed;
};
