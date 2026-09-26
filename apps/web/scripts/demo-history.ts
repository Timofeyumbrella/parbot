import { DEPLOYED_APP_URL } from '../src/lib/env';

/**
 * The app's own host for the seeded answers. Seeding the hosted demo from a laptop needs
 * NEXT_PUBLIC_APP_URL set to the deployment; without one the answers name the deployed host.
 */
export const demoAppUrl = (value = process.env.NEXT_PUBLIC_APP_URL) =>
  value?.trim() || DEPLOYED_APP_URL;

const widgetScriptUrl = (appUrl: string) => `${appUrl.replace(/\/+$/, '')}/widget.js`;

export type Exchange = {
  question: string;
  answer: string | null;
  doc?: string;
  feedback?: 1 | -1;
  channel?: 'app' | 'widget';
  page?: string;
};

/**
 * Questions a reader of Parbot's docs would ask, answered or not, for the inbox and overview.
 * `appUrl` is the host that serves widget.js, so a quoted install snippet loads when copied.
 */
export const demoExchanges = (appUrl: string): Exchange[] => [
  {
    question: 'How do I install the widget on my docs site?',
    answer: `Add one script tag to any page:\n\n\`\`\`html\n<script src="${widgetScriptUrl(appUrl)}" data-parbot="pb_your_public_key" async></script>\n\`\`\`\n\nThe exact snippet with your key is on the Widget page of your assistant [1].`,
    doc: 'Installing the widget',
    feedback: 1,
    page: 'https://docs.example.com/getting-started',
  },
  {
    question: 'What is palette mode?',
    answer:
      'Palette mode has no launcher in the way. Readers press ⌘K, or Ctrl+K on Windows and Linux, and a command-palette style dialog opens with the question box on top. It is available on Starter and Growth [1].',
    doc: 'Installing the widget',
    page: 'https://docs.example.com/widget',
  },
  {
    question: 'Does it work with Docusaurus?',
    answer:
      'Yes. For Docusaurus, Mintlify, Astro, Hugo and plain HTML, paste the script tag into the site head or footer template [1].',
    doc: 'Installing the widget',
    feedback: 1,
    page: 'https://docs.example.com/widget',
  },
  {
    question: 'How many pages can I index on the Starter plan?',
    answer:
      'Starter includes 2,000 indexed pages across all of your assistants, with 3,000 answers a month [1].',
    doc: 'Plans and billing',
    page: 'https://docs.example.com/pricing',
  },
  {
    question: 'What happens when the docs do not cover a question?',
    answer:
      'The assistant says so instead of guessing. With lead capture on, the widget then offers a small form for an email and a note, and the lead appears in your Inbox. The question is also recorded as unanswered [1].',
    doc: 'Theming and behaviour',
    feedback: 1,
    channel: 'app',
  },
  {
    question: 'Can I restrict which sites can load my widget?',
    answer:
      'Yes. Add the origins on the Widget page, one per line. Bare hostnames and wildcards like *.example.com are accepted, and requests from anywhere else are refused [1].',
    doc: 'Installing the widget',
    page: 'https://docs.example.com/widget',
  },
  {
    question: 'Do you support JavaScript-rendered docs sites?',
    answer:
      'Not for crawling: pages that render everything with JavaScript after load are not rendered. Give Parbot a sitemap or export the pages instead [1].',
    doc: 'Frequently asked questions',
    feedback: -1,
    page: 'https://docs.example.com/sources',
  },
  {
    question: 'Is there a Slack integration?',
    answer: null,
    page: 'https://docs.example.com/integrations',
  },
  {
    question: 'Can I export conversations to CSV automatically every week?',
    answer: null,
    page: 'https://docs.example.com/inbox',
  },
  {
    question: 'How do I delete my account?',
    answer:
      'Write to privacy@parbot.dev and the account is deleted along with everything it owns [1].',
    doc: 'Privacy and security',
    channel: 'app',
  },
  {
    question: 'Does Parbot train models on my documentation?',
    answer:
      'No. Only the handful of passages closest to a question are sent to the model, together with the question and the recent turns of that conversation. Parbot does not train models on your content [1].',
    doc: 'Privacy and security',
    feedback: 1,
    page: 'https://docs.example.com/privacy',
  },
  {
    question: 'Is there an API?',
    answer: null,
    page: 'https://docs.example.com/api',
  },
];
