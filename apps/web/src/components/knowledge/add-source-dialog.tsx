'use client';

import { cn } from 'cn';
import { FileText, Globe, type LucideIcon, Map, TextAlignStart, Upload } from 'lucide-react';
import { useActionState, useEffect, useId, useRef, useState } from 'react';

import { addSource, type AddSourceState } from '@/actions/sources';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Source } from '@/lib/db';
import { formatBytes, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, UPLOAD_TYPES_LABEL, uploadTypeFor } from '@/lib/uploads';

export type AddSourceTab = 'url' | 'sitemap' | 'upload' | 'text';

export const ADD_SOURCE_TABS: { id: AddSourceTab; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'url', label: 'Website', icon: Globe, blurb: 'Crawl a docs site from a start page.' },
  { id: 'sitemap', label: 'Sitemap', icon: Map, blurb: 'Index every page a sitemap lists.' },
  { id: 'upload', label: 'Upload', icon: FileText, blurb: `${UPLOAD_TYPES_LABEL}.` },
  { id: 'text', label: 'Paste text', icon: TextAlignStart, blurb: 'Notes, FAQs, anything in plain text.' },
];

type AddSourceDialogProps = {
  assistantId: string;
  open: boolean;
  tab: AddSourceTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: AddSourceTab) => void;
  onCreated: (source: Source) => void;
};

const initialState: AddSourceState = {};

const FormError = ({ message }: { message?: string }) =>
  message ? (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  ) : null;

/** Website, sitemap and pasted text share one server action; the fields differ by kind. */
const RemoteOrTextForm = ({
  kind,
  assistantId,
  onCreated,
}: {
  kind: Exclude<AddSourceTab, 'upload'>;
  assistantId: string;
  onCreated: (source: Source) => void;
}) => {
  const [state, formAction, pending] = useActionState(addSource, initialState);
  const id = useId();
  const handled = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (state.source && state.submittedAt !== handled.current) {
      handled.current = state.submittedAt;
      onCreated(state.source);
    }
  }, [state, onCreated]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <input type="hidden" name="kind" value={kind} />
      <input type="hidden" name="assistantId" value={assistantId} />

      {kind === 'text' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input id={`${id}-title`} name="title" placeholder="Refund policy" required maxLength={200} autoFocus />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-text`}>Text</Label>
            <Textarea
              id={`${id}-text`}
              name="text"
              required
              rows={10}
              placeholder="Paste the text the assistant should know. Markdown headings are kept as sections."
              className="max-h-72 min-h-40"
            />
          </div>
        </>
      ) : (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={`${id}-url`}>{kind === 'url' ? 'Start page' : 'Sitemap address'}</Label>
          <Input
            id={`${id}-url`}
            name="url"
            type="url"
            inputMode="url"
            required
            autoFocus
            placeholder={kind === 'url' ? 'https://docs.example.com/guide/' : 'https://docs.example.com/sitemap.xml'}
          />
          <p className="text-muted-foreground text-xs">
            {kind === 'url'
              ? 'We follow links under this path.'
              : 'Every page the sitemap lists is indexed. A sitemap index is followed one level down.'}
          </p>
        </div>
      )}

      <FormError message={state.error} />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending}>
          {pending ? 'Adding…' : kind === 'url' ? 'Add website' : kind === 'sitemap' ? 'Add sitemap' : 'Add text'}
        </Button>
      </div>
    </form>
  );
};

/**
 * Uploads go straight to the API route as multipart form data: a server action would cap the
 * body well below the 25 MB a document is allowed.
 */
const UploadForm = ({ assistantId, onCreated }: { assistantId: string; onCreated: (source: Source) => void }) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);
  const [dragging, setDragging] = useState(false);
  const [pending, setPending] = useState(false);

  const pick = (candidate: File | null | undefined) => {
    setError(undefined);

    if (!candidate) {
      return;
    }

    if (!uploadTypeFor(candidate.name, candidate.type)) {
      setError(`That file type is not supported. Upload ${UPLOAD_TYPES_LABEL}.`);

      return;
    }

    if (candidate.size > MAX_UPLOAD_BYTES) {
      setError('That file is larger than 25 MB. Split it or pick a smaller one.');

      return;
    }

    setFile(candidate);
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setError('Choose a file to upload.');

      return;
    }

    setPending(true);
    setError(undefined);

    const body = new FormData();

    body.set('assistantId', assistantId);
    body.set('file', file);

    if (title.trim()) {
      body.set('title', title.trim());
    }

    try {
      const response = await fetch('/api/sources', { method: 'POST', body });
      const payload = (await response.json().catch(() => null)) as { source?: Source; error?: string } | null;

      if (!response.ok || !payload?.source) {
        setError(payload?.error ?? `The upload failed (HTTP ${response.status}). Try again.`);

        return;
      }

      onCreated(payload.source);
    } catch {
      setError('The upload did not go through. Check your connection and try again.');
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="File"
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          pick(event.dataTransfer.files[0]);
        }}
        className={cn(
          'flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-6 text-center transition-colors',
          dragging ? 'border-primary bg-primary/5' : 'border-border',
        )}
      >
        <Upload className="text-muted-foreground size-5" aria-hidden="true" />
        {file ? (
          <p className="text-sm">
            <span className="font-medium">{file.name}</span>
            <span className="text-muted-foreground"> · {formatBytes(file.size)}</span>
          </p>
        ) : (
          <p className="text-muted-foreground text-sm">Drop a file here</p>
        )}
        <Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}>
          {file ? 'Choose another file' : 'Choose file'}
        </Button>
        <input
          ref={inputRef}
          id={`${id}-file`}
          type="file"
          accept={UPLOAD_ACCEPT}
          className="sr-only"
          aria-label="Choose file"
          onChange={(event) => {
            pick(event.target.files?.[0]);
            event.target.value = '';
          }}
        />
        <p className="text-muted-foreground text-xs">{UPLOAD_TYPES_LABEL}, up to 25 MB.</p>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`${id}-title`}>Name (optional)</Label>
        <Input
          id={`${id}-title`}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={file?.name ?? 'Defaults to the file name'}
          maxLength={200}
        />
      </div>

      <FormError message={error} />

      <div className="flex justify-end">
        <Button type="submit" disabled={pending || !file}>
          {pending ? 'Uploading…' : 'Upload file'}
        </Button>
      </div>
    </form>
  );
};

export const AddSourceDialog = ({ assistantId, open, tab, onOpenChange, onTabChange, onCreated }: AddSourceDialogProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="sm:max-w-lg">
      <DialogHeader>
        <DialogTitle>Add source</DialogTitle>
        <DialogDescription>Parbot reads it, splits it into passages and answers from them with citations.</DialogDescription>
      </DialogHeader>

      <Tabs value={tab} onValueChange={(value) => onTabChange(value as AddSourceTab)}>
        <TabsList className="w-full">
          {ADD_SOURCE_TABS.map((entry) => (
            <TabsTrigger key={entry.id} value={entry.id}>
              <entry.icon aria-hidden="true" />
              <span className="hidden sm:inline">{entry.label}</span>
              <span className="sm:hidden">{entry.id === 'text' ? 'Text' : entry.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="url" className="pt-2">
          <RemoteOrTextForm kind="url" assistantId={assistantId} onCreated={onCreated} />
        </TabsContent>
        <TabsContent value="sitemap" className="pt-2">
          <RemoteOrTextForm kind="sitemap" assistantId={assistantId} onCreated={onCreated} />
        </TabsContent>
        <TabsContent value="upload" className="pt-2">
          <UploadForm assistantId={assistantId} onCreated={onCreated} />
        </TabsContent>
        <TabsContent value="text" className="pt-2">
          <RemoteOrTextForm kind="text" assistantId={assistantId} onCreated={onCreated} />
        </TabsContent>
      </Tabs>
    </DialogContent>
  </Dialog>
);
