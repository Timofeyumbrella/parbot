/** Tags this run's throwaway accounts; workers inherit the variable from the main process. */
export default function globalSetup() {
  process.env.E2E_RUN_TAG ??= `r${Date.now().toString(36)}`;
}
