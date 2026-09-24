'use client';

import { cn } from 'cn';
import { FileText, Globe, type LucideIcon, Map, TextAlignStart, Upload } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { addSource } from '@/actions/sources';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import type { Source } from '@/lib/db';
import { labelForUrl } from '@/lib/ingest/label';
import { firstIssue, sourceInputSchema } from '@/lib/ingest/schema';
import { formatBytes, MAX_UPLOAD_BYTES, UPLOAD_ACCEPT, UPLOAD_TYPES, UPLOAD_TYPES_LABEL, uploadTypeFor } from '@/lib/uploads';

import { optimisticSource } from './optimistic';

export type AddSourceTab = 'url' | 'sitemap' | 'upload' | 'text';

type RemoteOrTextKind = Exclude<AddSourceTab, 'upload'>;

export const ADD_SOURCE_TABS: { id: AddSourceTab; label: string; icon: LucideIcon; blurb: string }[] = [
  { id: 'url', label: 'Website', icon: Globe, blurb: 'Crawl a docs site from a start page.' },
  { id: 'sitemap', label: 'Sitemap', icon: Map, blurb: 'Index every page a sitemap lists.' },
  { id: 'upload', label: 'Upload', icon: FileText, blurb: `${UPLOAD_TYPES_LABEL}.` },
  { id: 'text', label: 'Paste text', icon: TextAlignStart, blurb: 'Notes, FAQs, anything in plain text.' },
];

export type AddSourceDialogProps = {
  assistantId: string;
  ownerId: string;
  open: boolean;
  tab: AddSourceTab;
  onOpenChange: (open: boolean) => void;
  onTabChange: (tab: AddSourceTab) => void;
  /** A row to draw now, before the server has answered. */
  onPending: (source: Source) => void;
  /** The server's answer for that row: the saved source, or null when it refused. */
  onSettled: (id: string, source: Source | null) => void;
};

/** What has been typed on each tab. Kept while the dialog is closed so nothing is lost. */
type Drafts = { url: string; sitemap: string; textTitle: string; text: string; uploadTitle: string; file: File | null };

type Errors = Partial<Record<AddSourceTab, string>>;

const EMPTY_DRAFTS: Drafts = { url: '', sitemap: '', textTitle: '', text: '', uploadTitle: '', file: null };

export const UPLOAD_FAILED_OFFLINE = 'The upload did not go through. Check your connection and try again.';

const FormError = ({ message }: { message?: string }) =>
  message ? (
    <p role="alert" className="text-destructive text-sm">
      {message}
    </p>
  ) : null;

const submitLabel: Record<RemoteOrTextKind, string> = { url: 'Add website', sitemap: 'Add sitemap', text: 'Add text' };

type RemoteOrTextFormProps = {
  kind: RemoteOrTextKind;
  drafts: Drafts;
  error?: string;
  onDraft: (patch: Partial<Drafts>) => void;
  onSubmit: (kind: RemoteOrTextKind) => void;
};

/** Website, sitemap and pasted text share one server action; the fields differ by kind. */
const RemoteOrTextForm = ({ kind, drafts, error, onDraft, onSubmit }: RemoteOrTextFormProps) => {
  const id = useId();

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(kind);
      }}
      className="flex flex-col gap-4"
    >
      {kind === 'text' ? (
        <>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-title`}>Title</Label>
            <Input
              id={`${id}-title`}
              name="title"
              value={drafts.textTitle}
              onChange={(event) => onDraft({ textTitle: event.target.value })}
              placeholder="Refund policy"
              required
              maxLength={200}
              autoFocus
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${id}-text`}>Text</Label>
            <Textarea
              id={`${id}-text`}
              name="text"
              value={drafts.text}
              onChange={(event) => onDraft({ text: event.target.value })}
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
            value={drafts[kind]}
            onChange={(event) => onDraft({ [kind]: event.target.value })}
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

      <FormError message={error} />

      <div className="flex justify-end">
        <Button type="submit">{submitLabel[kind]}</Button>
      </div>
    </form>
  );
};

type UploadFormProps = {
  drafts: Drafts;
  error?: string;
  onDraft: (patch: Partial<Drafts>) => void;
  onError: (message: string | undefined) => void;
  onSubmit: () => void;
};

const UploadForm = ({ drafts, error, onDraft, onError, onSubmit }: UploadFormProps) => {
  const id = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const { file } = drafts;

  const pick = (candidate: File | null | undefined) => {
    onError(undefined);

    if (!candidate) {
      return;
    }

    if (!uploadTypeFor(candidate.name, candidate.type)) {
      onError(`That file type is not supported. Upload ${UPLOAD_TYPES_LABEL}.`);

      return;
    }

    if (candidate.size > MAX_UPLOAD_BYTES) {
      onError('That file is larger than 25 MB. Split it or pick a smaller one.');

      return;
    }

    onDraft({ file: candidate });
  };

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit();
      }}
      className="flex flex-col gap-4"
    >
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
          value={drafts.uploadTitle}
          onChange={(event) => onDraft({ uploadTitle: event.target.value })}
          placeholder={file?.name ?? 'Defaults to the file name'}
          maxLength={200}
        />
      </div>

      <FormError message={error} />

      <div className="flex justify-end">
        <Button type="submit" disabled={!file}>
          Upload file
        </Button>
      </div>
    </form>
  );
};

/**
 * Adds a source without making anyone wait: the row is drawn and the dialog closes the moment the
 * form is sent. If the server refuses, the row goes away and the dialog comes back with what was
 * typed and the reason. Drafts live here, above the dialog content, so closing keeps them.
 */
export const AddSourceDialog = ({
  assistantId,
  ownerId,
  open,
  tab,
  onOpenChange,
  onTabChange,
  onPending,
  onSettled,
}: AddSourceDialogProps) => {
  const [drafts, setDrafts] = useState<Drafts>(EMPTY_DRAFTS);
  const [errors, setErrors] = useState<Errors>({});

  const patchDrafts = (patch: Partial<Drafts>) => setDrafts((current) => ({ ...current, ...patch }));
  const setError = (kind: AddSourceTab, message: string | undefined) =>
    setErrors((current) => ({ ...current, [kind]: message }));

  /** The server said no: take the row back and show the reason where it was typed. */
  const refuse = (kind: AddSourceTab, id: string, message: string) => {
    onSettled(id, null);
    setError(kind, message);
    onTabChange(kind);
    onOpenChange(true);
  };

  const submitRemoteOrText = async (kind: RemoteOrTextKind) => {
    const id = crypto.randomUUID();
    const input =
      kind === 'text'
        ? { kind, assistantId, id, title: drafts.textTitle, text: drafts.text }
        : { kind, assistantId, id, url: drafts[kind] };
    const parsed = sourceInputSchema.safeParse(input);

    if (!parsed.success) {
      setError(kind, firstIssue(parsed.error));

      return;
    }

    const form = new FormData();

    for (const [name, value] of Object.entries(parsed.data)) {
      if (value !== undefined) {
        form.set(name, value);
      }
    }

    const row =
      parsed.data.kind === 'text'
        ? optimisticSource({
            id,
            assistantId,
            ownerId,
            kind: 'text',
            title: parsed.data.title,
            fileName: `${id}.md`,
            mimeType: UPLOAD_TYPES.md.mime,
            byteSize: new Blob([parsed.data.text]).size,
          })
        : optimisticSource({
            id,
            assistantId,
            ownerId,
            kind: parsed.data.kind,
            title: labelForUrl(parsed.data.url, parsed.data.kind),
            uri: parsed.data.url,
          });

    setError(kind, undefined);
    onPending(row);
    onOpenChange(false);

    const result = await addSource({}, form);

    if (result.source) {
      onSettled(id, result.source);
      patchDrafts(kind === 'text' ? { textTitle: '', text: '' } : { [kind]: '' });

      return;
    }

    refuse(kind, id, result.error ?? 'Something went wrong. Try again.');
  };

  /**
   * Uploads go straight to the API route as multipart form data: a server action would cap the
   * body well below the 25 MB a document is allowed.
   */
  const submitUpload = async () => {
    const { file } = drafts;
    const type = file ? uploadTypeFor(file.name, file.type) : null;

    if (!file || !type) {
      setError('upload', 'Choose a file to upload.');

      return;
    }

    const id = crypto.randomUUID();
    const title = drafts.uploadTitle.trim();
    const spec = UPLOAD_TYPES[type];
    const body = new FormData();

    body.set('assistantId', assistantId);
    body.set('id', id);
    body.set('file', file);

    if (title) {
      body.set('title', title);
    }

    setError('upload', undefined);
    onPending(
      optimisticSource({
        id,
        assistantId,
        ownerId,
        kind: 'upload',
        title: title || file.name.slice(0, 200),
        fileName: `${id}.${spec.extensions[0]}`,
        mimeType: spec.mime,
        byteSize: file.size,
      }),
    );
    onOpenChange(false);

    try {
      const response = await fetch('/api/sources', { method: 'POST', body });
      const payload = (await response.json().catch(() => null)) as { source?: Source; error?: string } | null;

      if (!response.ok || !payload?.source) {
        refuse('upload', id, payload?.error ?? `The upload failed (HTTP ${response.status}). Try again.`);

        return;
      }

      onSettled(id, payload.source);
      patchDrafts({ file: null, uploadTitle: '' });
    } catch {
      refuse('upload', id, UPLOAD_FAILED_OFFLINE);
    }
  };

  return (
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
          {(['url', 'sitemap', 'text'] as const).map((kind) => (
            <TabsContent key={kind} value={kind} className="pt-2">
              <RemoteOrTextForm
                kind={kind}
                drafts={drafts}
                error={errors[kind]}
                onDraft={patchDrafts}
                onSubmit={(submitted) => void submitRemoteOrText(submitted)}
              />
            </TabsContent>
          ))}
          <TabsContent value="upload" className="pt-2">
            <UploadForm
              drafts={drafts}
              error={errors.upload}
              onDraft={patchDrafts}
              onError={(message) => setError('upload', message)}
              onSubmit={() => void submitUpload()}
            />
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
};
