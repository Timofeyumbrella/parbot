const read = (name: string, fallback?: string) => {
  const value = process.env[name]?.trim();

  if (value) {
    return value;
  }

  if (fallback !== undefined) {
    return fallback;
  }

  throw new Error(`Missing environment variable ${name}. Copy .env.example to .env and fill it in.`);
};

/** Values that are safe in the browser. Next.js inlines them, so they must be read literally. */
export const publicEnv = {
  appUrl: process.env.NEXT_PUBLIC_APP_URL?.trim() || 'http://localhost:3000',
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() || 'http://127.0.0.1:54321',
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() || '',
};

export const serverEnv = () => ({
  supabaseServiceRoleKey: read('SUPABASE_SERVICE_ROLE_KEY'),
  billingProvider: read('BILLING_PROVIDER', 'mock') === 'stripe' ? 'stripe' : 'mock',
  stripeSecretKey: process.env.STRIPE_SECRET_KEY?.trim() || undefined,
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET?.trim() || undefined,
});
