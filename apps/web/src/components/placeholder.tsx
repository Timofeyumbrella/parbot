import { PageContainer, PageHeader } from '@/components/page-header';

/** Temporary stand-in for a screen that has not been built yet. Replace, do not extend. */
export const Placeholder = ({ title, owner }: { title: string; owner: string }) => (
  <PageContainer>
    <PageHeader title={title} description={`Not built yet. Owner: ${owner}.`} />
  </PageContainer>
);
