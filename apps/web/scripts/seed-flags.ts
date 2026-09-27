/** The options `seed-demo.ts` takes. See the script's header for what each does. */
export const SEED_FLAGS = ['history', 'refresh-history', 'reset', 'write-env'] as const;

export type SeedFlags = {
  history: boolean;
  refreshHistory: boolean;
  reset: boolean;
  writeEnv: boolean;
};

/**
 * Reads the command line, refusing what would do something other than asked: an unknown option
 * (a typo would silently skip the refresh), and --refresh-history with --reset, since one keeps
 * the assistant and its public key and the other deletes them.
 */
export const parseSeedFlags = (argv: string[]): SeedFlags => {
  const known = new Set<string>(SEED_FLAGS.map((flag) => `--${flag}`));
  const unknown = argv.filter((arg) => !known.has(arg));

  if (unknown.length > 0) {
    throw new Error(
      `Unknown option ${unknown.join(', ')}. Use ${SEED_FLAGS.map((flag) => `--${flag}`).join(', ')}.`,
    );
  }

  const has = (flag: (typeof SEED_FLAGS)[number]) => argv.includes(`--${flag}`);
  const flags = {
    history: has('history'),
    refreshHistory: has('refresh-history'),
    reset: has('reset'),
    writeEnv: has('write-env'),
  };

  if (flags.refreshHistory && flags.reset) {
    throw new Error(
      '--refresh-history keeps the demo assistant and its public key, and --reset deletes them. Use one or the other.',
    );
  }

  return flags;
};
