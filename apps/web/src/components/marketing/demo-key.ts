/**
 * The public key of the assistant behind the landing page's ⌘K palette, the real widget on the
 * page. Leave NEXT_PUBLIC_DEMO_ASSISTANT_KEY unset to leave the palette off; the hero's example
 * conversation is scripted and plays either way.
 */
export const demoAssistantKey = () => process.env.NEXT_PUBLIC_DEMO_ASSISTANT_KEY?.trim() || null;
