'use client';

import { cn } from 'cn';
import { ArrowUpRight, Mail } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateLeadStatus } from '@/actions/leads';
import { LocalTime } from '@/components/inbox/local-time';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { hostnameOf, LEAD_STATUSES, type LeadStatus } from '@/lib/analytics';
import type { Lead } from '@/lib/db';
import { safeHttpUrl } from '@parbot/shared';

export type LeadRow = Pick<Lead, 'id' | 'email' | 'note' | 'page_url' | 'status' | 'created_at' | 'conversation_id'>;

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  closed: 'Closed',
};

export const OFFLINE_ERROR = 'The lead could not be saved. Check your connection and try again.';

const StatusSelect = ({
  lead,
  status: saved,
  onSaved,
}: {
  lead: LeadRow;
  status: LeadStatus;
  onSaved: (status: LeadStatus) => void;
}) => {
  const [status, setOptimistic] = useOptimistic(saved);
  const [, startTransition] = useTransition();

  const change = (next: string) => {
    const nextStatus = LEAD_STATUSES.find((candidate) => candidate === next);

    if (!nextStatus || nextStatus === status) {
      return;
    }

    startTransition(async () => {
      setOptimistic(nextStatus);

      // A failed request must not escape the transition: an error boundary would replace the
      // whole screen. The optimistic value simply falls back to the saved one.
      try {
        const result = await updateLeadStatus({ leadId: lead.id, status: nextStatus });

        if (result.ok) {
          onSaved(result.status);
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error(OFFLINE_ERROR);
      }
    });
  };

  return (
    <Select value={status} onValueChange={change}>
      <SelectTrigger size="sm" aria-label={`Status of ${lead.email}`} className="w-32">
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {LEAD_STATUSES.map((option) => (
          <SelectItem key={option} value={option}>
            {STATUS_LABELS[option]}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
};

/** Below `sm` each row is a card and every cell carries its own label. */
const cell = 'flex items-start justify-between gap-3 whitespace-normal sm:table-cell sm:whitespace-nowrap';
const label =
  'before:text-muted-foreground before:shrink-0 before:text-xs before:content-[attr(data-label)] sm:before:hidden';

export const LeadsTable = ({ rows, assistantId, now }: { rows: LeadRow[]; assistantId: string; now: number }) => {
  // What the server has confirmed since the page was rendered; server props win otherwise.
  const [saved, setSaved] = useState<Record<string, LeadStatus>>({});

  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
        <Mail aria-hidden="true" className="text-muted-foreground size-5" />
        <p className="font-medium">No leads yet</p>
        <p className="text-muted-foreground max-w-md text-sm">
          With lead capture on, visitors can leave their email after a question the docs could not answer. Turn it on
          from the{' '}
          <Link href={`/a/${assistantId}/widget`} className="text-foreground underline underline-offset-4">
            Widget screen
          </Link>
          ; it is part of the Starter and Growth plans.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table data-testid="leads-table">
        <TableHeader className="hidden sm:table-header-group">
          <TableRow className="hover:bg-transparent">
            <TableHead>Email</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Page</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Conversation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody className="max-sm:block">
          {rows.map((lead) => {
            const host = hostnameOf(lead.page_url);

            return (
              <TableRow key={lead.id} data-lead-id={lead.id} className="max-sm:flex max-sm:flex-col max-sm:gap-2 max-sm:p-3">
                <TableCell data-label="Email" className={cn(cell, label, 'max-sm:p-0')}>
                  <a href={`mailto:${lead.email}`} className="font-medium break-all underline-offset-4 hover:underline">
                    {lead.email}
                  </a>
                </TableCell>
                <TableCell
                  data-label="Note"
                  className={cn(cell, label, 'text-muted-foreground max-sm:p-0 sm:max-w-64 sm:truncate sm:whitespace-normal')}
                  title={lead.note ?? undefined}
                >
                  <span className="min-w-0 text-right sm:text-left">{lead.note || <span aria-label="No note">–</span>}</span>
                </TableCell>
                <TableCell data-label="Page" className={cn(cell, label, 'text-muted-foreground max-sm:p-0')}>
                  {lead.page_url && safeHttpUrl(lead.page_url) ? (
                    <a
                      href={safeHttpUrl(lead.page_url)!}
                      target="_blank"
                      rel="noreferrer"
                      title={lead.page_url}
                      className="truncate underline-offset-4 hover:underline"
                    >
                      {host ?? lead.page_url}
                    </a>
                  ) : (
                    <span aria-label="No page">–</span>
                  )}
                </TableCell>
                <TableCell data-label="Time" className={cn(cell, label, 'text-muted-foreground max-sm:p-0')}>
                  <LocalTime value={lead.created_at} now={now} />
                </TableCell>
                <TableCell data-label="Status" className={cn(cell, label, 'items-center max-sm:p-0')}>
                  <StatusSelect
                    lead={lead}
                    status={saved[lead.id] ?? lead.status}
                    onSaved={(status) => setSaved((current) => ({ ...current, [lead.id]: status }))}
                  />
                </TableCell>
                <TableCell data-label="Conversation" className={cn(cell, label, 'max-sm:p-0 sm:text-right')}>
                  {lead.conversation_id ? (
                    <Link
                      href={`/a/${assistantId}/inbox/${lead.conversation_id}`}
                      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 text-xs"
                    >
                      Open
                      <ArrowUpRight aria-hidden="true" className="size-3.5" />
                    </Link>
                  ) : (
                    <span className="text-muted-foreground text-xs">None</span>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
};
