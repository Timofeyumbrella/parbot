import { FlaskConical } from 'lucide-react';

/** Shown whenever the mock provider is active, so nobody mistakes a test plan for a paid one. */
export const TestModeBanner = () => (
  <div
    role="status"
    className="bg-accent text-accent-foreground flex items-center gap-2.5 rounded-lg px-3.5 py-2.5 text-sm"
  >
    <FlaskConical className="size-4 shrink-0" />
    <span>Billing runs in test mode. No card is charged.</span>
  </div>
);
