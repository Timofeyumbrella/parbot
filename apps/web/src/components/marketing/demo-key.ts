/**
 * The public key of the assistant the landing page demonstrates. Set NEXT_PUBLIC_DEMO_ASSISTANT_KEY
 * to answer visitors from a real assistant; leave it unset for the scripted demo.
 */
export const demoAssistantKey = () => process.env.NEXT_PUBLIC_DEMO_ASSISTANT_KEY?.trim() || null;
