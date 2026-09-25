import Link from 'next/link';

import { Brand } from '@/components/marketing/brand';
import { ACCOUNT_LINKS, NAV_LINKS } from '@/components/marketing/links';
import { Container } from '@/components/marketing/section';

const GROUPS = [
  { title: 'Product', links: NAV_LINKS },
  { title: 'Account', links: ACCOUNT_LINKS },
] as const;

export const MarketingFooter = () => (
  <footer className="border-t py-12">
    <Container className="flex flex-col gap-10">
      <div className="flex flex-col justify-between gap-10 sm:flex-row">
        <div className="flex max-w-xs flex-col gap-3">
          <Brand />
          <p className="text-muted-foreground text-sm leading-relaxed">
            Ask-AI for developer docs. Cited answers in a bubble or a ⌘K palette, and an inbox that
            shows what readers could not find.
          </p>
        </div>
        <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:gap-16">
          {GROUPS.map((group) => (
            <div key={group.title} className="flex flex-col gap-3">
              <p className="text-muted-foreground text-xs font-medium uppercase tracking-wider">
                {group.title}
              </p>
              <ul className="flex flex-col gap-2 text-sm">
                {group.links.map((link) => (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      className="text-foreground/80 hover:text-foreground transition-colors"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
      </div>
      <div className="text-muted-foreground flex flex-col gap-2 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p>© {new Date().getFullYear()} Parbot</p>
        <p>Every answer cites its source.</p>
      </div>
    </Container>
  </footer>
);
