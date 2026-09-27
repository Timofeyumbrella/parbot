/**
 * The public key of the assistant behind the landing page's ⌘K palette, the real widget on the
 * page. Leave NEXT_PUBLIC_DEMO_ASSISTANT_KEY unset to leave the palette off; the hero's example
 * conversation is scripted and plays either way.
 */
export const demoAssistantKey = () => process.env.NEXT_PUBLIC_DEMO_ASSISTANT_KEY?.trim() || null;

/**
 * The same assistant on its public demo page, as a bubble. Below the hero's two-column width the
 * landing hides the palette's pill and a phone has no ⌘K, so this is where a phone visitor tries it.
 */
export const demoPageHref = (demoKey: string) => `/demo/${encodeURIComponent(demoKey)}?mode=bubble`;
