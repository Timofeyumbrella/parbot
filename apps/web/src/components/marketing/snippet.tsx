'use client';

import { Check, Copy } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

/** One-line code with a copy button. Falls back to selecting the text where the clipboard is blocked. */
export const Snippet = ({ code, label }: { code: string; label: string }) => {
  const [state, setState] = useState<'idle' | 'copied' | 'select'>('idle');
  const codeRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (state === 'idle') {
      return;
    }

    const timer = setTimeout(() => setState('idle'), 2000);

    return () => clearTimeout(timer);
  }, [state]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setState('copied');
    } catch {
      const selection = window.getSelection();

      if (codeRef.current && selection) {
        selection.selectAllChildren(codeRef.current);
      }

      setState('select');
    }
  };

  return (
    <div className="bg-card flex items-center gap-3 rounded-lg border p-2 pl-4">
      <pre
        className="min-w-0 flex-1 overflow-x-auto py-1.5 font-mono text-[13px] leading-relaxed"
        aria-label={label}
      >
        <code ref={codeRef}>{code}</code>
      </pre>
      <Button type="button" variant="outline" size="sm" onClick={copy} className="shrink-0">
        {state === 'copied' ? (
          <Check data-icon="inline-start" />
        ) : (
          <Copy data-icon="inline-start" />
        )}
        {state === 'copied' ? 'Copied' : state === 'select' ? 'Selected' : 'Copy'}
      </Button>
    </div>
  );
};
