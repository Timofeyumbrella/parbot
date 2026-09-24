'use client';

import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';

const COPIED_FOR_MS = 1500;

/** Copies text and reports "copied" for a moment. Falls back to a selection-free no-op without clipboard access. */
export const useCopy = () => {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) {
        clearTimeout(timer.current);
      }
    },
    [],
  );

  const copy = useCallback(async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);

      if (timer.current) {
        clearTimeout(timer.current);
      }

      timer.current = setTimeout(() => setCopied(false), COPIED_FOR_MS);
    } catch {
      setCopied(false);
    }
  }, []);

  return { copied, copy };
};

export const CopyButton = ({ text, label = 'Copy', className }: { text: string; label?: string; className?: string }) => {
  const { copied, copy } = useCopy();

  return (
    <Button
      type="button"
      variant="ghost"
      size="xs"
      className={className}
      aria-label={copied ? 'Copied' : label}
      onClick={() => void copy(text)}
    >
      {copied ? <Check className="text-success" /> : <Copy />}
      {copied ? 'Copied' : label}
    </Button>
  );
};

type CodeBlockProps = {
  language: string | null;
  code: string;
  children: React.ReactNode;
};

/** A fenced code block: language label, copy button, and the highlighted `<pre>` underneath. */
export const CodeBlock = ({ language, code, children }: CodeBlockProps) => (
  <div className="bg-card my-3 overflow-hidden rounded-lg border" data-testid="code-block">
    <div className="bg-muted/60 flex h-8 items-center justify-between border-b pr-1 pl-3">
      <span className="text-muted-foreground font-mono text-[11px] tracking-wide uppercase">
        {language ?? 'text'}
      </span>
      <CopyButton text={code} />
    </div>
    <pre>{children}</pre>
  </div>
);
