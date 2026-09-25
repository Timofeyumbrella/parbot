// @vitest-environment node
import { createClient } from '@supabase/supabase-js';
import { afterAll, describe, expect, it } from 'vitest';

import type { Database } from '@/lib/db';
import { STORAGE_BUCKET } from '@/lib/uploads';

import { removeStoredFiles } from './source-files';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? 'http://127.0.0.1:54321';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// The recursion relies on Storage reporting folders with a null id and one level per listing.
// This checks those assumptions against the local stack; skipped where there is none.
describe.skipIf(!serviceKey)('removeStoredFiles against local Storage', () => {
  const service = createClient<Database>(url, serviceKey ?? '', {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  // The service role bypasses the folder policies, so the ids need not belong to anyone.
  const owner = crypto.randomUUID();
  const assistants = [crypto.randomUUID(), crypto.randomUUID()];
  const paths = [
    `${owner}/${assistants[0]}/one.md`,
    `${owner}/${assistants[0]}/two.md`,
    `${owner}/${assistants[1]}/three.md`,
  ];

  afterAll(async () => {
    await service.storage.from(STORAGE_BUCKET).remove(paths);
  });

  it('removes one assistant folder, then the rest of the account', async () => {
    for (const path of paths) {
      const { error } = await service.storage
        .from(STORAGE_BUCKET)
        .upload(path, new Blob(['# hello'], { type: 'text/markdown' }), {
          contentType: 'text/markdown',
        });

      expect(error).toBeNull();
    }

    const first = await removeStoredFiles(service, `${owner}/${assistants[0]}`);

    expect(first.sort()).toEqual(paths.slice(0, 2));

    const { data: left } = await service.storage
      .from(STORAGE_BUCKET)
      .list(`${owner}/${assistants[1]}`);

    expect(left?.map((entry) => entry.name)).toEqual(['three.md']);

    const rest = await removeStoredFiles(service, owner);

    expect(rest).toEqual([paths[2]]);

    const { data: gone } = await service.storage.from(STORAGE_BUCKET).list(owner);

    expect(gone).toEqual([]);
  });
});
