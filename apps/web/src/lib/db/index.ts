import type { Database } from './types';

export type { Database } from './types';

export type Tables<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Row'];
export type TablesInsert<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Insert'];
export type TablesUpdate<T extends keyof Database['public']['Tables']> =
  Database['public']['Tables'][T]['Update'];
export type Enums<T extends keyof Database['public']['Enums']> = Database['public']['Enums'][T];

export type Assistant = Tables<'assistants'>;
export type Source = Tables<'sources'>;
export type Document = Tables<'documents'>;
export type Chunk = Tables<'chunks'>;
export type Conversation = Tables<'conversations'>;
export type Message = Tables<'messages'>;
export type Lead = Tables<'leads'>;
export type Subscription = Tables<'subscriptions'>;
export type Profile = Tables<'profiles'>;
