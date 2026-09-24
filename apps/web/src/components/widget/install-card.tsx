'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const InstallCard = ({ snippet }: { snippet: string }) => {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2000);

    return () => window.clearTimeout(timer);
  }, [copied]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(true);
      toast.success('Snippet copied');
    } catch {
      toast.error('Copying did not work. Select the snippet and copy it by hand.');
    }
  };

  return (
    <Card size="sm">
      <CardHeader>
        <CardTitle>Install</CardTitle>
        <CardDescription>One script tag on every page where the assistant should appear.</CardDescription>
        <CardAction>
          <Button type="button" variant="outline" size="sm" onClick={copy} aria-label="Copy the install snippet">
            {copied ? <Check /> : <Copy />}
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <pre className="bg-muted overflow-x-auto rounded-lg p-3 font-mono text-xs leading-relaxed" tabIndex={0}>
          <code>{snippet}</code>
        </pre>
        <div className="flex flex-col gap-1.5">
          <p className="text-sm font-medium">How to install</p>
          <ol className="text-muted-foreground list-decimal space-y-1.5 pl-5 text-sm">
            <li>
              Paste the tag before the closing body tag of your site layout, or into the footer template of your docs
              tool. In Next.js, use next/script with the same attributes.
            </li>
            <li>To limit which sites can use the key, list them under Allowed origins. An empty list allows any site.</li>
            <li>Deploy. Installed widgets pick up new settings on their next page load.</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  );
};
