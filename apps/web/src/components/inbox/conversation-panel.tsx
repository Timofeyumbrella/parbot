import { ChannelBadge } from '@/components/inbox/channel-badge';
import { DeleteConversation } from '@/components/inbox/delete-conversation';
import { AbsoluteTime, LocalTime } from '@/components/inbox/local-time';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { hostnameOf } from '@/lib/analytics';
import type { Conversation, Lead } from '@/lib/db';
import { formatCount } from '@/lib/format';

export type PanelLead = Pick<Lead, 'id' | 'email' | 'status'>;

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="flex flex-col gap-0.5">
    <dt className="text-muted-foreground text-xs">{label}</dt>
    <dd className="min-w-0 text-sm break-words">{children}</dd>
  </div>
);

/** The facts about a conversation that are not in the transcript, and the way to delete it. */
export const ConversationPanel = ({
  conversation,
  leads,
  now,
}: {
  conversation: Pick<
    Conversation,
    'id' | 'assistant_id' | 'channel' | 'visitor_id' | 'page_url' | 'created_at' | 'message_count' | 'unanswered_count'
  >;
  leads: PanelLead[];
  now: number;
}) => {
  const host = hostnameOf(conversation.page_url);

  return (
    <Card size="sm" className="gap-3" data-testid="conversation-panel">
      <CardHeader>
        <CardTitle>Details</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="flex flex-col gap-3">
          <Row label="Channel">
            <ChannelBadge channel={conversation.channel} />
          </Row>
          <Row label="Visitor">
            {conversation.visitor_id ? (
              <code className="bg-muted rounded px-1 py-0.5 font-mono text-xs">{conversation.visitor_id}</code>
            ) : (
              <span className="text-muted-foreground">You, in Chat</span>
            )}
          </Row>
          <Row label="Page">
            {conversation.page_url ? (
              <a
                href={conversation.page_url}
                target="_blank"
                rel="noreferrer"
                title={conversation.page_url}
                className="underline underline-offset-4"
              >
                {host ?? conversation.page_url}
              </a>
            ) : (
              <span className="text-muted-foreground">Not recorded</span>
            )}
          </Row>
          <Row label="Started">
            <LocalTime value={conversation.created_at} now={now} />
            <AbsoluteTime value={conversation.created_at} className="text-muted-foreground block text-xs" />
          </Row>
          <Row label="Messages">
            <span className="tabular-nums">{formatCount(conversation.message_count)}</span>
            {conversation.unanswered_count > 0 ? (
              <span className="text-muted-foreground">
                {' '}
                · {formatCount(conversation.unanswered_count)} unanswered
              </span>
            ) : null}
          </Row>
          <Row label="Leads">
            {leads.length === 0 ? (
              <span className="text-muted-foreground">None linked</span>
            ) : (
              <ul className="flex flex-col gap-1">
                {leads.map((lead) => (
                  <li key={lead.id} className="flex items-center gap-2">
                    <a href={`mailto:${lead.email}`} className="truncate underline underline-offset-4">
                      {lead.email}
                    </a>
                    <span className="text-muted-foreground text-xs capitalize">{lead.status}</span>
                  </li>
                ))}
              </ul>
            )}
          </Row>
        </dl>
        <div className="mt-4 border-t pt-4">
          <DeleteConversation assistantId={conversation.assistant_id} conversationId={conversation.id} />
        </div>
      </CardContent>
    </Card>
  );
};
