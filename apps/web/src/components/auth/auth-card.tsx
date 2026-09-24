import { Bot } from 'lucide-react';
import Link from 'next/link';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const TAGLINE = 'An assistant built from your documentation.';

type AuthCardProps = {
  title: string;
  description: string;
  children: React.ReactNode;
  /** The line under the card that points at the other page. */
  footer: React.ReactNode;
};

/** The centred shell both auth pages share. Server rendered, nothing to fetch. */
export const AuthCard = ({ title, description, children, footer }: AuthCardProps) => (
  <div className="flex w-full max-w-sm flex-col items-center gap-6">
    <div className="flex flex-col items-center gap-2">
      <Link href="/" className="flex items-center gap-2 text-lg font-semibold tracking-tight">
        <span className="bg-primary text-primary-foreground flex size-7 items-center justify-center rounded-md">
          <Bot className="size-4" />
        </span>
        Parbot
      </Link>
      <p className="text-muted-foreground text-sm">{TAGLINE}</p>
    </div>
    <Card className="w-full">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
    <p className="text-muted-foreground text-sm">{footer}</p>
  </div>
);
