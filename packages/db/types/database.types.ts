// Fase 1 — tipos generados a mano a partir de migrations/0001_initial_schema.sql.
// Fase 4 — extendido con migrations/0002_admin_panel.sql (audit_log y las
// columnas nuevas de restaurants).
// Reemplaza este archivo corriendo `supabase gen types typescript` contra el
// proyecto real en cuanto exista (sin red disponible en esta sesión).
//
// `Relationships: []` y `Views: { [_ in never]: never }` no son decoración:
// sin ellos este tipo no satisface `GenericSchema` de @supabase/postgrest-js
// y todas las filas de todas las tablas se infieren como `never` en
// silencio (lo encontramos recién al correr `tsc` por primera vez, con
// dependencias instaladas — antes no había forma de comprobarlo).

export type JobStatus = 'queued' | 'processing' | 'done' | 'failed';

// migrations/0007_plans_and_analytics.sql
export type MenuEventType = 'menu_view' | 'dish_view' | 'view_3d' | 'view_ar';

export interface Database {
  public: {
    Tables: {
      restaurants: {
        Row: {
          id: string;
          short_id: string;
          slug: string;
          name: string;
          logo_url: string | null;
          brand_color: string;
          currency: string;
          is_published: boolean;
          owner_id: string | null;
          created_at: string;
          photo_rights_accepted_by: string | null;
          photo_rights_accepted_at: string | null;
          terms_version: number | null;
          terms_accepted_at: string | null;
          terms_accepted_ip: string | null;
          website_url: string | null;
          plan: string;
          base_language: string;
          idiomas: string[];
          idiomas_extra: number;
          sin_marca: boolean;
        };
        Insert: {
          id?: string;
          short_id: string;
          slug: string;
          name: string;
          logo_url?: string | null;
          brand_color?: string;
          currency?: string;
          is_published?: boolean;
          owner_id?: string | null;
          created_at?: string;
          photo_rights_accepted_by?: string | null;
          photo_rights_accepted_at?: string | null;
          terms_version?: number | null;
          terms_accepted_at?: string | null;
          terms_accepted_ip?: string | null;
          website_url?: string | null;
          plan?: string;
          base_language?: string;
          idiomas?: string[];
          idiomas_extra?: number;
          sin_marca?: boolean;
        };
        Update: Partial<Database['public']['Tables']['restaurants']['Insert']>;
        Relationships: [];
      };
      categories: {
        Row: {
          id: string;
          restaurant_id: string;
          name: string;
          position: number;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          name: string;
          position?: number;
        };
        Update: Partial<Database['public']['Tables']['categories']['Insert']>;
        Relationships: [];
      };
      dishes: {
        Row: {
          id: string;
          restaurant_id: string;
          category_id: string | null;
          name: string;
          description: string | null;
          price_cents: number;
          photo_url: string | null;
          position: number;
          is_available: boolean;
          agotado_hasta: string | null;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          category_id?: string | null;
          name: string;
          description?: string | null;
          price_cents?: number;
          photo_url?: string | null;
          position?: number;
          is_available?: boolean;
          agotado_hasta?: string | null;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['dishes']['Insert']>;
        Relationships: [];
      };
      dish_assets: {
        Row: {
          id: string;
          dish_id: string;
          glb_url: string | null;
          usdz_url: string | null;
          poster_url: string | null;
          triangles: number | null;
          bytes_glb: number | null;
          generator: string | null;
          is_active: boolean;
          created_at: string;
        };
        Insert: {
          id?: string;
          dish_id: string;
          glb_url?: string | null;
          usdz_url?: string | null;
          poster_url?: string | null;
          triangles?: number | null;
          bytes_glb?: number | null;
          generator?: string | null;
          is_active?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['dish_assets']['Insert']>;
        Relationships: [];
      };
      jobs: {
        Row: {
          id: string;
          restaurant_id: string;
          dish_id: string;
          source_photo: string;
          status: JobStatus;
          attempts: number;
          error: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          dish_id: string;
          source_photo: string;
          status?: JobStatus;
          attempts?: number;
          error?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['jobs']['Insert']>;
        Relationships: [];
      };
      menu_events: {
        Row: {
          id: number;
          restaurant_id: string;
          dish_id: string | null;
          type: MenuEventType;
          session_id: string;
          created_at: string;
        };
        Insert: {
          id?: number;
          restaurant_id: string;
          dish_id?: string | null;
          type: MenuEventType;
          session_id: string;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['menu_events']['Insert']>;
        Relationships: [];
      };
      dish_translations: {
        Row: {
          dish_id: string;
          lang: string;
          name: string;
          description: string | null;
          editada_a_mano: boolean;
          updated_at: string;
        };
        Insert: {
          dish_id: string;
          lang: string;
          name: string;
          description?: string | null;
          editada_a_mano?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['dish_translations']['Insert']>;
        Relationships: [];
      };
      category_translations: {
        Row: {
          category_id: string;
          lang: string;
          name: string;
          editada_a_mano: boolean;
          updated_at: string;
        };
        Insert: {
          category_id: string;
          lang: string;
          name: string;
          editada_a_mano?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database['public']['Tables']['category_translations']['Insert']>;
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: string;
          restaurant_id: string;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          metadata: Record<string, unknown> | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          restaurant_id: string;
          actor_id?: string | null;
          action: string;
          entity_type: string;
          entity_id?: string | null;
          metadata?: Record<string, unknown> | null;
          created_at?: string;
        };
        Update: Partial<Database['public']['Tables']['audit_log']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      // Fase 5 — migrations/0003_worker_queue.sql. Reclama y marca como
      // 'processing' un único job en una sola transacción (SELECT ... FOR
      // UPDATE SKIP LOCKED); devuelve 0 filas si no hay nada en cola.
      claim_next_job: {
        Args: Record<string, never>;
        Returns: Database['public']['Tables']['jobs']['Row'][];
      };
    };
  };
}
