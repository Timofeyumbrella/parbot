export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      assistants: {
        Row: {
          allowed_origins: string[]
          created_at: string
          description: string | null
          hide_branding: boolean
          id: string
          instructions: string | null
          lead_capture: boolean
          mode: string
          model: string | null
          name: string
          owner_id: string
          public_key: string
          slug: string
          suggested_questions: string[]
          theme: Json
          updated_at: string
          welcome_message: string
        }
        Insert: {
          allowed_origins?: string[]
          created_at?: string
          description?: string | null
          hide_branding?: boolean
          id?: string
          instructions?: string | null
          lead_capture?: boolean
          mode?: string
          model?: string | null
          name: string
          owner_id: string
          public_key?: string
          slug: string
          suggested_questions?: string[]
          theme?: Json
          updated_at?: string
          welcome_message?: string
        }
        Update: {
          allowed_origins?: string[]
          created_at?: string
          description?: string | null
          hide_branding?: boolean
          id?: string
          instructions?: string | null
          lead_capture?: boolean
          mode?: string
          model?: string | null
          name?: string
          owner_id?: string
          public_key?: string
          slug?: string
          suggested_questions?: string[]
          theme?: Json
          updated_at?: string
          welcome_message?: string
        }
        Relationships: [
          {
            foreignKeyName: "assistants_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      chunks: {
        Row: {
          assistant_id: string
          content: string
          created_at: string
          document_id: string
          embedding: string
          heading: string | null
          id: string
          owner_id: string
          position: number
          token_count: number
        }
        Insert: {
          assistant_id: string
          content: string
          created_at?: string
          document_id: string
          embedding: string
          heading?: string | null
          id?: string
          owner_id: string
          position: number
          token_count?: number
        }
        Update: {
          assistant_id?: string
          content?: string
          created_at?: string
          document_id?: string
          embedding?: string
          heading?: string | null
          id?: string
          owner_id?: string
          position?: number
          token_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "chunks_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_document_id_fkey"
            columns: ["document_id"]
            isOneToOne: false
            referencedRelation: "documents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "chunks_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          assistant_id: string
          channel: Database["public"]["Enums"]["chat_channel"]
          created_at: string
          id: string
          last_message_at: string | null
          message_count: number
          owner_id: string
          page_url: string | null
          title: string | null
          unanswered_count: number
          updated_at: string
          visitor_id: string | null
        }
        Insert: {
          assistant_id: string
          channel?: Database["public"]["Enums"]["chat_channel"]
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          owner_id: string
          page_url?: string | null
          title?: string | null
          unanswered_count?: number
          updated_at?: string
          visitor_id?: string | null
        }
        Update: {
          assistant_id?: string
          channel?: Database["public"]["Enums"]["chat_channel"]
          created_at?: string
          id?: string
          last_message_at?: string | null
          message_count?: number
          owner_id?: string
          page_url?: string | null
          title?: string | null
          unanswered_count?: number
          updated_at?: string
          visitor_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "conversations_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "conversations_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          assistant_id: string
          checksum: string
          content: string
          created_at: string
          id: string
          owner_id: string
          source_id: string
          title: string
          token_count: number
          updated_at: string
          url: string | null
        }
        Insert: {
          assistant_id: string
          checksum: string
          content: string
          created_at?: string
          id?: string
          owner_id: string
          source_id: string
          title: string
          token_count?: number
          updated_at?: string
          url?: string | null
        }
        Update: {
          assistant_id?: string
          checksum?: string
          content?: string
          created_at?: string
          id?: string
          owner_id?: string
          source_id?: string
          title?: string
          token_count?: number
          updated_at?: string
          url?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "sources"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assistant_id: string
          conversation_id: string | null
          created_at: string
          email: string
          id: string
          note: string | null
          owner_id: string
          page_url: string | null
          status: Database["public"]["Enums"]["lead_status"]
          updated_at: string
        }
        Insert: {
          assistant_id: string
          conversation_id?: string | null
          created_at?: string
          email: string
          id?: string
          note?: string | null
          owner_id: string
          page_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Update: {
          assistant_id?: string
          conversation_id?: string | null
          created_at?: string
          email?: string
          id?: string
          note?: string | null
          owner_id?: string
          page_url?: string | null
          status?: Database["public"]["Enums"]["lead_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      message_stops: {
        Row: {
          assistant_id: string
          content: string
          conversation_id: string
          created_at: string
          message_id: string
          owner_id: string
        }
        Insert: {
          assistant_id: string
          content?: string
          conversation_id: string
          created_at?: string
          message_id: string
          owner_id: string
        }
        Update: {
          assistant_id?: string
          content?: string
          conversation_id?: string
          created_at?: string
          message_id?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "message_stops_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "message_stops_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          answered: boolean | null
          assistant_id: string
          citations: Json
          completion_tokens: number | null
          content: string
          conversation_id: string
          created_at: string
          feedback: number | null
          id: string
          latency_ms: number | null
          model: string | null
          owner_id: string
          prompt_tokens: number | null
          role: Database["public"]["Enums"]["message_role"]
        }
        Insert: {
          answered?: boolean | null
          assistant_id: string
          citations?: Json
          completion_tokens?: number | null
          content: string
          conversation_id: string
          created_at?: string
          feedback?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          owner_id: string
          prompt_tokens?: number | null
          role: Database["public"]["Enums"]["message_role"]
        }
        Update: {
          answered?: boolean | null
          assistant_id?: string
          citations?: Json
          completion_tokens?: number | null
          content?: string
          conversation_id?: string
          created_at?: string
          feedback?: number | null
          id?: string
          latency_ms?: number | null
          model?: string | null
          owner_id?: string
          prompt_tokens?: number | null
          role?: Database["public"]["Enums"]["message_role"]
        }
        Relationships: [
          {
            foreignKeyName: "messages_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          email: string
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          bucket: string
          expires_at: string
          hits: string[]
        }
        Insert: {
          bucket: string
          expires_at: string
          hits?: string[]
        }
        Update: {
          bucket?: string
          expires_at?: string
          hits?: string[]
        }
        Relationships: []
      }
      sources: {
        Row: {
          assistant_id: string
          byte_size: number | null
          chunk_count: number
          created_at: string
          document_count: number
          error: string | null
          id: string
          kind: Database["public"]["Enums"]["source_kind"]
          last_indexed_at: string | null
          mime_type: string | null
          owner_id: string
          pages_done: number
          pages_found: number
          status: Database["public"]["Enums"]["source_status"]
          storage_path: string | null
          title: string
          updated_at: string
          uri: string | null
        }
        Insert: {
          assistant_id: string
          byte_size?: number | null
          chunk_count?: number
          created_at?: string
          document_count?: number
          error?: string | null
          id?: string
          kind: Database["public"]["Enums"]["source_kind"]
          last_indexed_at?: string | null
          mime_type?: string | null
          owner_id: string
          pages_done?: number
          pages_found?: number
          status?: Database["public"]["Enums"]["source_status"]
          storage_path?: string | null
          title: string
          updated_at?: string
          uri?: string | null
        }
        Update: {
          assistant_id?: string
          byte_size?: number | null
          chunk_count?: number
          created_at?: string
          document_count?: number
          error?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["source_kind"]
          last_indexed_at?: string | null
          mime_type?: string | null
          owner_id?: string
          pages_done?: number
          pages_found?: number
          status?: Database["public"]["Enums"]["source_status"]
          storage_path?: string | null
          title?: string
          updated_at?: string
          uri?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sources_assistant_id_fkey"
            columns: ["assistant_id"]
            isOneToOne: false
            referencedRelation: "assistants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sources_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          account_id: string
          billing_interval:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end: boolean
          created_at: string
          current_period_end: string | null
          plan_id: Database["public"]["Enums"]["plan_id"]
          status: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          updated_at: string
        }
        Insert: {
          account_id: string
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan_id?: Database["public"]["Enums"]["plan_id"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Update: {
          account_id?: string
          billing_interval?:
            | Database["public"]["Enums"]["billing_interval"]
            | null
          cancel_at_period_end?: boolean
          created_at?: string
          current_period_end?: string | null
          plan_id?: Database["public"]["Enums"]["plan_id"]
          status?: Database["public"]["Enums"]["subscription_status"]
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: true
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          metric: Database["public"]["Enums"]["usage_metric"]
          owner_id: string
          period_start: string
          updated_at: string
          value: number
        }
        Insert: {
          metric: Database["public"]["Enums"]["usage_metric"]
          owner_id: string
          period_start: string
          updated_at?: string
          value?: number
        }
        Update: {
          metric?: Database["public"]["Enums"]["usage_metric"]
          owner_id?: string
          period_start?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "usage_counters_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      assistant_daily: {
        Args: { assistant: string; since: string }
        Returns: {
          answered: number
          day: string
          questions: number
          unanswered: number
        }[]
      }
      assistant_stats: {
        Args: { assistant: string; since: string }
        Returns: {
          answered: number
          conversations: number
          leads: number
          median_latency_ms: number
          negative: number
          positive: number
          questions: number
          unanswered: number
        }[]
      }
      increment_usage: {
        Args: {
          delta?: number
          owner: string
          usage: Database["public"]["Enums"]["usage_metric"]
        }
        Returns: number
      }
      insert_document_within_limit: {
        Args: {
          assistant: string
          owner: string
          page_checksum: string
          page_content: string
          page_limit: number
          page_title: string
          page_token_count: number
          page_url?: string
          replaces?: string
          source: string
        }
        Returns: string
      }
      match_chunks: {
        Args: {
          assistant: string
          match_count?: number
          query_embedding: string
          similarity_threshold?: number
        }
        Returns: {
          chunk_id: string
          content: string
          document_id: string
          document_title: string
          document_url: string
          heading: string
          similarity: number
        }[]
      }
      owns_assistant: { Args: { assistant: string }; Returns: boolean }
      release_message: { Args: { owner: string }; Returns: undefined }
      reserve_message: {
        Args: { max_allowed: number; owner: string }
        Returns: boolean
      }
      take_rate_limit: {
        Args: { bucket: string; max_hits: number; window_ms: number }
        Returns: {
          allowed: boolean
          retry_after_ms: number
        }[]
      }
      take_rate_limits: {
        Args: { buckets: string[]; max_hits: number[]; window_ms: number[] }
        Returns: {
          allowed: boolean
          retry_after_ms: number
        }[]
      }
      top_questions: {
        Args: { assistant: string; max_rows?: number; since: string }
        Returns: {
          asks: number
          last_asked_at: string
          question: string
        }[]
      }
      unanswered_questions: {
        Args: { assistant: string; max_rows?: number; since: string }
        Returns: {
          asks: number
          conversation_id: string
          last_asked_at: string
          question: string
        }[]
      }
    }
    Enums: {
      billing_interval: "monthly" | "yearly"
      chat_channel: "app" | "widget"
      lead_status: "new" | "contacted" | "closed"
      message_role: "user" | "assistant"
      plan_id: "hobby" | "starter" | "growth"
      source_kind: "url" | "sitemap" | "upload" | "text"
      source_status: "queued" | "crawling" | "indexing" | "ready" | "failed"
      subscription_status:
        | "active"
        | "trialing"
        | "past_due"
        | "canceled"
        | "incomplete"
      usage_metric: "messages"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      billing_interval: ["monthly", "yearly"],
      chat_channel: ["app", "widget"],
      lead_status: ["new", "contacted", "closed"],
      message_role: ["user", "assistant"],
      plan_id: ["hobby", "starter", "growth"],
      source_kind: ["url", "sitemap", "upload", "text"],
      source_status: ["queued", "crawling", "indexing", "ready", "failed"],
      subscription_status: [
        "active",
        "trialing",
        "past_due",
        "canceled",
        "incomplete",
      ],
      usage_metric: ["messages"],
    },
  },
} as const

