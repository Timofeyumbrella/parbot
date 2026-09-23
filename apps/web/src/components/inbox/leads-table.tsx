'use client';

import { ArrowUpRight, Mail } from 'lucide-react';
import Link from 'next/link';
import { useOptimistic, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { updateLeadStatus } from '@/actions/leads';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { absoluteTime, hostnameOf, LEAD_STATUSES, type LeadStatus, relativeTime } from '@/lib/analytics';
import type { Lead } from '@/lib/db';

export type LeadRow = Pick<Lead, 'id' | 'email' | 'note' | 'page_url' | 'status' | 'created_at' | 'conversation_id'>;

const STATUS_LABELS: Record<LeadStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  closed: 'Closed',
};

const StatusSelect = ({ lead }: { lead: LeadRow }) => {
  const [saved, setSaved] = useState<LeadStatus>(lead.status);
  const [status, setOptimistic] = useOptimistic(saved);
  const [, startTransition] = useTransition();

  const change = (next: string) => {
    const nextStatus = LEAD_STATUSES.find((candidate) => candidate === next);

    if (!nextStatus || nextStatus === status) {
      return;
    }

    startTransition(async () => {
      setOptimistic(nextStatus);

      const result = await updateLeadStatus({ leadId: lead.id, status: nextStatus });

      if (result.ok) {
        setSaved(result.status);
      } else {
        toast.error(result.error);
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

export const LeadsTable = ({ rows, assistantId, now }: { rows: LeadRow[]; assistantId: string; now: number }) => {
  if (rows.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-6 py-12 text-center">
        <Mail aria-hidden="true" className="text-muted-foreground size-5" />
        <p className="font-medium">No leads yet</p>
        <p className="text-muted-foreground max-w-md text-sm">
          When lead capture is on, visitors can leave their email after a question the docs could not answer. Turn it
          on in{' '}
          <Link href={`/a/${assistantId}/settings`} prefetch className="text-foreground underline underline-offset-4">
            Settings
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border">
      <Table data-testid="leads-table">
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>Email</TableHead>
            <TableHead>Note</TableHead>
            <TableHead>Page</TableHead>
            <TableHead>Time</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="text-right">Conversation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((lead) => {
            const host = hostnameOf(lead.page_url);

            return (
              <TableRow key={lead.id} data-lead-id={lead.id}>
                <TableCell>
                  <a href={`mailto:${lead.email}`} className="font-medium underline-offset-4 hover:underline">
                    {lead.email}
                  </a>
                </TableCell>
                <TableCell className="text-muted-foreground max-w-64 truncate whitespace-normal" title={lead.note ?? undefined}>
                  {lead.note || <span aria-label="No note">–</span>}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {lead.page_url ? (
                    <a
                      href={lead.page_url}
                      target="_blank"
                      rel="noreferrer"
                      title={lead.page_url}
                      className="underline-offset-4 hover:underline"
                    >
                      {host ?? lead.page_url}
                    </a>
                  ) : (
                    <span aria-label="No page">–</span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  <time dateTime={lead.created_at} title={absoluteTime(lead.created_at)}>
                    {relativeTime(lead.created_at, now)}
                  </time>
                </TableCell>
                <TableCell>
                  <StatusSelect lead={lead} />
                </TableCell>
                <TableCell className="text-right">
                  {lead.conversation_id ? (
                    <Link
                      href={`/a/${assistantId}/inbox/${lead.conversation_id}`}
                      prefetch
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
