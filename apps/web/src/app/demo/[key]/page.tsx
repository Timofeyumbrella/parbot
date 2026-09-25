import { cn } from 'cn';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Script from 'next/script';
import { cache } from 'react';

import { createSupabaseServiceClient } from '@/lib/supabase/service';
import { findAssistantByKey, loadOwnerPlan, widgetConfigFor } from '@/lib/widget-api';

import { demoNames, resolveDemoMode, resolveDemoPreview } from './demo-mode';

export const dynamic = 'force-dynamic';

// No loading.tsx here on purpose: a loading boundary streams a 200 shell before the key is
// looked up, so an unknown key could never answer with a real 404 status. The lookup is one
// indexed read and the page is small, so nothing is gained by streaming it.

/** Looked up once per request, however many of the metadata and page functions ask. */
const load = cache(async (key: string) => {
  const service = createSupabaseServiceClient();
  const assistant = await findAssistantByKey(service, key);

  if (!assistant) {
    return null;
  }

  const plan = await loadOwnerPlan(service, assistant.owner_id);

  return { name: assistant.name, config: widgetConfigFor(assistant, plan) };
});

export async function generateMetadata({ params }: PageProps<'/demo/[key]'>): Promise<Metadata> {
  const { key } = await params;
  const found = await load(key);

  return {
    title: found ? `Example docs for ${demoNames(found.name).product}` : 'Demo',
    robots: { index: false, follow: false },
  };
}

const SECTIONS = [
  {
    title: 'Getting started',
    body: [
      'Install the client with your package manager, then create a project from the dashboard. Every project gets a sandbox environment with its own keys, so nothing you try here touches production.',
      'The quickstart below walks through a first request, checks the response, and shows where to look when something is off. Most teams are done in ten minutes.',
    ],
  },
  {
    title: 'Configuration',
    body: [
      'Settings live in a single file at the root of the project. Values can be overridden per environment with variables, which take precedence over the file. Secrets never belong in the file itself.',
      'Changes are picked up on the next start. Long running processes watch the file and reload the parts that changed without dropping connections.',
    ],
  },
  {
    title: 'Deploying',
    body: [
      'Builds are reproducible: the same commit always produces the same artifact. Deploy from a branch to a preview environment, promote it to production when it looks right, and roll back with one command if it does not.',
      'Logs and metrics stream to the dashboard as the deploy runs. Alerts fire on error rate and latency, with sensible defaults you can tune later.',
    ],
  },
] as const;

const NAV = [
  'Overview',
  'Getting started',
  'Configuration',
  'Deploying',
  'API reference',
  'Changelog',
] as const;

/**
 * A stand-in for a customer's documentation site, with the real widget loaded against the key
 * in the address. Public on purpose: it is what the install preview and the demo link show.
 */
export default async function DemoPage({ params, searchParams }: PageProps<'/demo/[key]'>) {
  const [{ key }, query] = await Promise.all([params, searchParams]);
  const found = await load(key);

  if (!found) {
    notFound();
  }

  const { config } = found;
  const names = demoNames(found.name);
  const { allowed, override, active } = resolveDemoMode(query.mode, config);
  const preview = resolveDemoPreview(query);

  return (
    <div className="bg-background text-foreground flex min-h-svh flex-col">
      <header className="border-b">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-3">
          <span className="font-semibold tracking-tight">{names.site}</span>
          <nav aria-label="Site" className="text-muted-foreground hidden gap-5 text-sm sm:flex">
            <span>Guides</span>
            <span>API</span>
            <span>Changelog</span>
          </nav>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-5xl flex-1 gap-10 px-4 py-10 md:grid-cols-[200px_minmax(0,1fr)]">
        <aside className="hidden md:block" aria-label="Docs">
          <ul className="flex flex-col gap-1 text-sm">
            {NAV.map((item, index) => (
              <li
                key={item}
                className={cn(
                  'rounded-md px-2.5 py-1.5',
                  index === 1 ? 'bg-muted font-medium' : 'text-muted-foreground',
                )}
              >
                {item}
              </li>
            ))}
          </ul>
        </aside>

        <main className="flex max-w-2xl flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="text-primary text-xs font-medium uppercase tracking-widest">
              Parbot demo
            </p>
            <h1 className="text-3xl font-semibold tracking-tight">
              Example docs for {names.product}
            </h1>
            <p className="text-muted-foreground">
              This page stands in for your documentation site. The widget on it is live and answers
              from the assistant’s sources.{' '}
              {active === 'palette'
                ? 'Press ⌘K (Ctrl+K on Windows and Linux) or use the pill in the corner to open it.'
                : 'Use the launcher in the bottom corner to open it.'}
            </p>
            <p className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span>Try it as</span>
              <a
                href={`/demo/${key}?mode=bubble`}
                className={cn(
                  'underline underline-offset-4',
                  active === 'bubble' && 'text-foreground font-medium',
                )}
              >
                bubble
              </a>
              {allowed.includes('palette') ? (
                <a
                  href={`/demo/${key}?mode=palette`}
                  className={cn(
                    'underline underline-offset-4',
                    active === 'palette' && 'text-foreground font-medium',
                  )}
                >
                  palette
                </a>
              ) : (
                <span>palette (Starter and up)</span>
              )}
            </p>
          </div>

          {SECTIONS.map((section) => (
            <section key={section.title} className="flex flex-col gap-3">
              <h2 className="text-xl font-semibold tracking-tight">{section.title}</h2>
              {section.body.map((paragraph) => (
                <p key={paragraph} className="text-muted-foreground leading-relaxed">
                  {paragraph}
                </p>
              ))}
            </section>
          ))}
        </main>
      </div>

      <Script
        src="/widget.js"
        strategy="afterInteractive"
        data-parbot={key}
        data-mode={override ?? undefined}
        data-version={preview.version ?? undefined}
        data-open={preview.open ? 'true' : undefined}
      />
    </div>
  );
}
