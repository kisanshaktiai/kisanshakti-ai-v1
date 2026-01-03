export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.3 (519615d)"
  }
  public: {
    Tables: {
      account_lockouts: {
        Row: {
          created_at: string | null
          email: string
          failed_attempts: number
          id: string
          ip_address: unknown
          last_attempt_at: string | null
          locked_until: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          failed_attempts?: number
          id?: string
          ip_address?: unknown
          last_attempt_at?: string | null
          locked_until?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          failed_attempts?: number
          id?: string
          ip_address?: unknown
          last_attempt_at?: string | null
          locked_until?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      achievements: {
        Row: {
          badge_type: string
          category: string
          created_at: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          name: string
          points_required: number
        }
        Insert: {
          badge_type: string
          category: string
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          points_required: number
        }
        Update: {
          badge_type?: string
          category?: string
          created_at?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          points_required?: number
        }
        Relationships: []
      }
      activation_codes: {
        Row: {
          archived: boolean | null
          code: string
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean | null
          last_used_at: string | null
          max_uses: number | null
          metadata: Json | null
          plan_id: string | null
          redeemed_at: string | null
          redeemed_by: string | null
          status: string | null
          tenant_id: string
          used_count: number | null
        }
        Insert: {
          archived?: boolean | null
          code: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          max_uses?: number | null
          metadata?: Json | null
          plan_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string | null
          tenant_id: string
          used_count?: number | null
        }
        Update: {
          archived?: boolean | null
          code?: string
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          last_used_at?: string | null
          max_uses?: number | null
          metadata?: Json | null
          plan_id?: string | null
          redeemed_at?: string | null
          redeemed_by?: string | null
          status?: string | null
          tenant_id?: string
          used_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_codes_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_codes_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_codes_redeemed_by_fkey"
            columns: ["redeemed_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "activation_codes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      activation_logs: {
        Row: {
          activation_code_id: string
          created_at: string | null
          error_message: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          success: boolean | null
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          activation_code_id: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          success?: boolean | null
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          activation_code_id?: string
          created_at?: string | null
          error_message?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          success?: boolean | null
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "activation_logs_activation_code_id_fkey"
            columns: ["activation_code_id"]
            isOneToOne: false
            referencedRelation: "activation_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activation_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      active_sessions: {
        Row: {
          client_info: Json | null
          created_at: string | null
          id: string
          ip_address: string | null
          is_active: boolean | null
          last_active_at: string
          session_started_at: string
          tenant_id: string | null
          updated_at: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          client_info?: Json | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_active_at?: string
          session_started_at?: string
          tenant_id?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          client_info?: Json | null
          created_at?: string | null
          id?: string
          ip_address?: string | null
          is_active?: boolean | null
          last_active_at?: string
          session_started_at?: string
          tenant_id?: string | null
          updated_at?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "active_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_audit_logs: {
        Row: {
          action: string
          admin_id: string | null
          correlation_id: string | null
          created_at: string | null
          details: Json | null
          duration_ms: number | null
          id: string
          ip_address: unknown
          request_id: string | null
          request_payload: Json | null
          response_data: Json | null
          security_context: Json | null
          session_id: string | null
          target_admin_id: string | null
          user_agent: string | null
        }
        Insert: {
          action: string
          admin_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          ip_address?: unknown
          request_id?: string | null
          request_payload?: Json | null
          response_data?: Json | null
          security_context?: Json | null
          session_id?: string | null
          target_admin_id?: string | null
          user_agent?: string | null
        }
        Update: {
          action?: string
          admin_id?: string | null
          correlation_id?: string | null
          created_at?: string | null
          details?: Json | null
          duration_ms?: number | null
          id?: string
          ip_address?: unknown
          request_id?: string | null
          request_payload?: Json | null
          response_data?: Json | null
          security_context?: Json | null
          session_id?: string | null
          target_admin_id?: string | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_audit_logs_admin_id_fkey"
            columns: ["admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "admin_audit_logs_target_admin_id_fkey"
            columns: ["target_admin_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_invite_analytics: {
        Row: {
          created_at: string
          event_type: string
          id: string
          invite_id: string
          ip_address: unknown
          metadata: Json | null
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          invite_id: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          invite_id?: string
          ip_address?: unknown
          metadata?: Json | null
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_invite_analytics_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "admin_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_invites: {
        Row: {
          accepted_at: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          invite_token: string
          invited_by: string
          metadata: Json | null
          role: string
          status: string
          updated_at: string
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          invite_token: string
          invited_by: string
          metadata?: Json | null
          role: string
          status?: string
          updated_at?: string
        }
        Update: {
          accepted_at?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          invite_token?: string
          invited_by?: string
          metadata?: Json | null
          role?: string
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "admin_invites_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_notifications: {
        Row: {
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          metadata: Json | null
          priority: string | null
          read_at: string | null
          recipient_id: string | null
          title: string
          type: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          metadata?: Json | null
          priority?: string | null
          read_at?: string | null
          recipient_id?: string | null
          title: string
          type?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          metadata?: Json | null
          priority?: string | null
          read_at?: string | null
          recipient_id?: string | null
          title?: string
          type?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_registration_tokens: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          invite_id: string | null
          metadata: Json | null
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          invite_id?: string | null
          metadata?: Json | null
          role: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          invite_id?: string | null
          metadata?: Json | null
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "admin_registration_tokens_invite_id_fkey"
            columns: ["invite_id"]
            isOneToOne: false
            referencedRelation: "admin_invites"
            referencedColumns: ["id"]
          },
        ]
      }
      admin_registrations: {
        Row: {
          completed_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          full_name: string
          id: string
          invited_by: string | null
          metadata: Json | null
          registration_token: string | null
          registration_type: string
          role: string
          status: string
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          full_name: string
          id?: string
          invited_by?: string | null
          metadata?: Json | null
          registration_token?: string | null
          registration_type?: string
          role?: string
          status?: string
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          full_name?: string
          id?: string
          invited_by?: string | null
          metadata?: Json | null
          registration_token?: string | null
          registration_type?: string
          role?: string
          status?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      admin_users: {
        Row: {
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean
          role: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          role?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      advisory_audit_log: {
        Row: {
          actions: Json
          advisory_id: string
          ai_adjustments: Json | null
          causes: string[]
          confidence: number
          engine_version: string
          execution_time_ms: number | null
          farmer_id: string | null
          farmer_rating: number | null
          feedback_at: string | null
          feedback_status: string | null
          generated_at: string | null
          generated_offline: boolean | null
          id: string
          input_snapshot: Json
          land_id: string | null
          reasoning_trace: string[] | null
          risk_level: string
          rules_applied: string[]
          synced_at: string | null
          tenant_id: string | null
        }
        Insert: {
          actions: Json
          advisory_id: string
          ai_adjustments?: Json | null
          causes: string[]
          confidence: number
          engine_version: string
          execution_time_ms?: number | null
          farmer_id?: string | null
          farmer_rating?: number | null
          feedback_at?: string | null
          feedback_status?: string | null
          generated_at?: string | null
          generated_offline?: boolean | null
          id?: string
          input_snapshot: Json
          land_id?: string | null
          reasoning_trace?: string[] | null
          risk_level: string
          rules_applied: string[]
          synced_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          actions?: Json
          advisory_id?: string
          ai_adjustments?: Json | null
          causes?: string[]
          confidence?: number
          engine_version?: string
          execution_time_ms?: number | null
          farmer_id?: string | null
          farmer_rating?: number | null
          feedback_at?: string | null
          feedback_status?: string | null
          generated_at?: string | null
          generated_offline?: boolean | null
          id?: string
          input_snapshot?: Json
          land_id?: string | null
          reasoning_trace?: string[] | null
          risk_level?: string
          rules_applied?: string[]
          synced_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advisory_audit_log_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_audit_log_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "advisory_audit_log_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "advisory_audit_log_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "advisory_audit_log_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "advisory_audit_log_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "advisory_audit_log_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_audit_log_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "advisory_audit_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      advisory_feedback: {
        Row: {
          action_id: string
          actual_input_used: Json | null
          advisory_id: string
          cost_incurred: number | null
          effectiveness_rating: number | null
          farmer_id: string | null
          id: string
          notes: string | null
          reason: string | null
          recorded_at: string | null
          recorded_by: string | null
          recorded_offline: boolean | null
          status: string
          synced_at: string | null
          tenant_id: string | null
        }
        Insert: {
          action_id: string
          actual_input_used?: Json | null
          advisory_id: string
          cost_incurred?: number | null
          effectiveness_rating?: number | null
          farmer_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          recorded_offline?: boolean | null
          status: string
          synced_at?: string | null
          tenant_id?: string | null
        }
        Update: {
          action_id?: string
          actual_input_used?: Json | null
          advisory_id?: string
          cost_incurred?: number | null
          effectiveness_rating?: number | null
          farmer_id?: string | null
          id?: string
          notes?: string | null
          reason?: string | null
          recorded_at?: string | null
          recorded_by?: string | null
          recorded_offline?: boolean | null
          status?: string
          synced_at?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "advisory_feedback_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "advisory_feedback_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "advisory_feedback_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      agri_market_sources: {
        Row: {
          active: boolean | null
          base_url: string | null
          board_name: string | null
          commodity_dropdown_selector: string | null
          commodity_html_path: string | null
          commodity_source: string | null
          commodity_text_expr: string | null
          commodity_value_attr: string | null
          country_id: string | null
          created_at: string | null
          data_endpoint: string | null
          data_request_method: string | null
          data_request_params: Json | null
          date_format: string | null
          date_regex: string | null
          date_row_selector: string | null
          fetch_method: string | null
          id: string
          last_checked_at: string | null
          main_page: string | null
          mapping: Json | null
          max_retries: number | null
          metadata: Json | null
          notes: string | null
          organization: string | null
          page_requires_session: boolean | null
          price_clean_regex: string | null
          rate_limit_delay: number | null
          row_selector: string | null
          sample_html: string | null
          scraper_class: string | null
          skip_empty_rows: boolean | null
          state_code: string | null
          state_id: string | null
          timeout_seconds: number | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          active?: boolean | null
          base_url?: string | null
          board_name?: string | null
          commodity_dropdown_selector?: string | null
          commodity_html_path?: string | null
          commodity_source?: string | null
          commodity_text_expr?: string | null
          commodity_value_attr?: string | null
          country_id?: string | null
          created_at?: string | null
          data_endpoint?: string | null
          data_request_method?: string | null
          data_request_params?: Json | null
          date_format?: string | null
          date_regex?: string | null
          date_row_selector?: string | null
          fetch_method?: string | null
          id?: string
          last_checked_at?: string | null
          main_page?: string | null
          mapping?: Json | null
          max_retries?: number | null
          metadata?: Json | null
          notes?: string | null
          organization?: string | null
          page_requires_session?: boolean | null
          price_clean_regex?: string | null
          rate_limit_delay?: number | null
          row_selector?: string | null
          sample_html?: string | null
          scraper_class?: string | null
          skip_empty_rows?: boolean | null
          state_code?: string | null
          state_id?: string | null
          timeout_seconds?: number | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          active?: boolean | null
          base_url?: string | null
          board_name?: string | null
          commodity_dropdown_selector?: string | null
          commodity_html_path?: string | null
          commodity_source?: string | null
          commodity_text_expr?: string | null
          commodity_value_attr?: string | null
          country_id?: string | null
          created_at?: string | null
          data_endpoint?: string | null
          data_request_method?: string | null
          data_request_params?: Json | null
          date_format?: string | null
          date_regex?: string | null
          date_row_selector?: string | null
          fetch_method?: string | null
          id?: string
          last_checked_at?: string | null
          main_page?: string | null
          mapping?: Json | null
          max_retries?: number | null
          metadata?: Json | null
          notes?: string | null
          organization?: string | null
          page_requires_session?: boolean | null
          price_clean_regex?: string | null
          rate_limit_delay?: number | null
          row_selector?: string | null
          sample_html?: string | null
          scraper_class?: string | null
          skip_empty_rows?: boolean | null
          state_code?: string | null
          state_id?: string | null
          timeout_seconds?: number | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      agri_marketing_insights: {
        Row: {
          affected_farmers_count: number | null
          affected_lands_count: number | null
          ai_reasoning: string
          confidence_score: number | null
          created_at: string | null
          crop_type: string | null
          id: string
          insight_type: string
          predicted_demand_quantity: number | null
          predicted_demand_unit: string | null
          recommendations: string | null
          region: string | null
          supporting_data: Json
          tenant_id: string
          time_window_end: string
          time_window_start: string
          total_area_hectares: number | null
        }
        Insert: {
          affected_farmers_count?: number | null
          affected_lands_count?: number | null
          ai_reasoning: string
          confidence_score?: number | null
          created_at?: string | null
          crop_type?: string | null
          id?: string
          insight_type: string
          predicted_demand_quantity?: number | null
          predicted_demand_unit?: string | null
          recommendations?: string | null
          region?: string | null
          supporting_data: Json
          tenant_id: string
          time_window_end: string
          time_window_start: string
          total_area_hectares?: number | null
        }
        Update: {
          affected_farmers_count?: number | null
          affected_lands_count?: number | null
          ai_reasoning?: string
          confidence_score?: number | null
          created_at?: string | null
          crop_type?: string | null
          id?: string
          insight_type?: string
          predicted_demand_quantity?: number | null
          predicted_demand_unit?: string | null
          recommendations?: string | null
          region?: string | null
          supporting_data?: Json
          tenant_id?: string
          time_window_end?: string
          time_window_start?: string
          total_area_hectares?: number | null
        }
        Relationships: []
      }
      agro_climatic_zones: {
        Row: {
          country_id: string | null
          created_at: string | null
          cropping_pattern: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          country_id?: string | null
          created_at?: string | null
          cropping_pattern?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          country_id?: string | null
          created_at?: string | null
          cropping_pattern?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      ai_chat_analytics: {
        Row: {
          avg_response_time_ms: number | null
          created_at: string
          date: string
          farmer_id: string
          id: string
          satisfaction_score: number | null
          tenant_id: string
          topics: Json | null
          total_messages: number | null
          total_sessions: number | null
        }
        Insert: {
          avg_response_time_ms?: number | null
          created_at?: string
          date?: string
          farmer_id: string
          id?: string
          satisfaction_score?: number | null
          tenant_id: string
          topics?: Json | null
          total_messages?: number | null
          total_sessions?: number | null
        }
        Update: {
          avg_response_time_ms?: number | null
          created_at?: string
          date?: string
          farmer_id?: string
          id?: string
          satisfaction_score?: number | null
          tenant_id?: string
          topics?: Json | null
          total_messages?: number | null
          total_sessions?: number | null
        }
        Relationships: []
      }
      ai_chat_audit_logs: {
        Row: {
          actions_filtered_out: Json | null
          actions_returned: Json | null
          agents_used: string[] | null
          allowed_scopes: string[] | null
          created_at: string | null
          crop_code: string | null
          detected_language: string | null
          farmer_id: string
          farmer_message: string | null
          forbidden_actions: string[] | null
          growth_stage: string | null
          id: string
          intent_label: string | null
          land_id: string | null
          llm_model_used: string | null
          locked_intent: string | null
          nlu_confidence: number | null
          observation_mapping: Json | null
          observations: Json | null
          processing_time_ms: number | null
          response_language_match: boolean | null
          response_source: string | null
          rules_fired: string[] | null
          session_id: string
          symbolic_decision_id: string | null
          tenant_id: string
          trace_id: string | null
          turn_id: string
          validation_errors: string[] | null
          validation_passed: boolean | null
        }
        Insert: {
          actions_filtered_out?: Json | null
          actions_returned?: Json | null
          agents_used?: string[] | null
          allowed_scopes?: string[] | null
          created_at?: string | null
          crop_code?: string | null
          detected_language?: string | null
          farmer_id: string
          farmer_message?: string | null
          forbidden_actions?: string[] | null
          growth_stage?: string | null
          id?: string
          intent_label?: string | null
          land_id?: string | null
          llm_model_used?: string | null
          locked_intent?: string | null
          nlu_confidence?: number | null
          observation_mapping?: Json | null
          observations?: Json | null
          processing_time_ms?: number | null
          response_language_match?: boolean | null
          response_source?: string | null
          rules_fired?: string[] | null
          session_id: string
          symbolic_decision_id?: string | null
          tenant_id: string
          trace_id?: string | null
          turn_id: string
          validation_errors?: string[] | null
          validation_passed?: boolean | null
        }
        Update: {
          actions_filtered_out?: Json | null
          actions_returned?: Json | null
          agents_used?: string[] | null
          allowed_scopes?: string[] | null
          created_at?: string | null
          crop_code?: string | null
          detected_language?: string | null
          farmer_id?: string
          farmer_message?: string | null
          forbidden_actions?: string[] | null
          growth_stage?: string | null
          id?: string
          intent_label?: string | null
          land_id?: string | null
          llm_model_used?: string | null
          locked_intent?: string | null
          nlu_confidence?: number | null
          observation_mapping?: Json | null
          observations?: Json | null
          processing_time_ms?: number | null
          response_language_match?: boolean | null
          response_source?: string | null
          rules_fired?: string[] | null
          session_id?: string
          symbolic_decision_id?: string | null
          tenant_id?: string
          trace_id?: string | null
          turn_id?: string
          validation_errors?: string[] | null
          validation_passed?: boolean | null
        }
        Relationships: []
      }
      ai_chat_messages: {
        Row: {
          actions_filtered_out: Json | null
          actions_returned: Json | null
          agricultural_accuracy: number | null
          agro_climatic_zone: string | null
          ai_model: string | null
          attachments: Json | null
          complexity_level: string | null
          content: string
          conversation_quality_score: number | null
          conversation_turn_number: number | null
          correction_notes: string | null
          created_at: string
          crop_context: Json | null
          crop_season: string | null
          decision_brain_source: boolean | null
          domain_tags: string[] | null
          edited_at: string | null
          error_details: Json | null
          excluded_reason: string | null
          farmer_id: string
          feedback_rating: number | null
          feedback_text: string | null
          feedback_timestamp: string | null
          human_verified: boolean | null
          id: string
          image_urls: string[] | null
          inferred_intent: string | null
          intent_confidence: number | null
          ip_address: unknown
          is_edited: boolean | null
          is_training_candidate: boolean | null
          land_context: Json | null
          language: string | null
          location_context: Json | null
          message_type: string | null
          metadata: Json | null
          off_topic: boolean | null
          parent_message_id: string | null
          partition_key: number | null
          preprocessed_content: string | null
          rainfall_zone: string | null
          response_time_ms: number | null
          role: string
          session_id: string
          soil_zone: string | null
          status: string | null
          tenant_id: string
          tokens_used: number | null
          training_processed: boolean | null
          updated_at: string | null
          user_agent: string | null
          weather_context: Json | null
          word_count: number | null
        }
        Insert: {
          actions_filtered_out?: Json | null
          actions_returned?: Json | null
          agricultural_accuracy?: number | null
          agro_climatic_zone?: string | null
          ai_model?: string | null
          attachments?: Json | null
          complexity_level?: string | null
          content: string
          conversation_quality_score?: number | null
          conversation_turn_number?: number | null
          correction_notes?: string | null
          created_at?: string
          crop_context?: Json | null
          crop_season?: string | null
          decision_brain_source?: boolean | null
          domain_tags?: string[] | null
          edited_at?: string | null
          error_details?: Json | null
          excluded_reason?: string | null
          farmer_id: string
          feedback_rating?: number | null
          feedback_text?: string | null
          feedback_timestamp?: string | null
          human_verified?: boolean | null
          id?: string
          image_urls?: string[] | null
          inferred_intent?: string | null
          intent_confidence?: number | null
          ip_address?: unknown
          is_edited?: boolean | null
          is_training_candidate?: boolean | null
          land_context?: Json | null
          language?: string | null
          location_context?: Json | null
          message_type?: string | null
          metadata?: Json | null
          off_topic?: boolean | null
          parent_message_id?: string | null
          partition_key?: number | null
          preprocessed_content?: string | null
          rainfall_zone?: string | null
          response_time_ms?: number | null
          role: string
          session_id: string
          soil_zone?: string | null
          status?: string | null
          tenant_id: string
          tokens_used?: number | null
          training_processed?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
          weather_context?: Json | null
          word_count?: number | null
        }
        Update: {
          actions_filtered_out?: Json | null
          actions_returned?: Json | null
          agricultural_accuracy?: number | null
          agro_climatic_zone?: string | null
          ai_model?: string | null
          attachments?: Json | null
          complexity_level?: string | null
          content?: string
          conversation_quality_score?: number | null
          conversation_turn_number?: number | null
          correction_notes?: string | null
          created_at?: string
          crop_context?: Json | null
          crop_season?: string | null
          decision_brain_source?: boolean | null
          domain_tags?: string[] | null
          edited_at?: string | null
          error_details?: Json | null
          excluded_reason?: string | null
          farmer_id?: string
          feedback_rating?: number | null
          feedback_text?: string | null
          feedback_timestamp?: string | null
          human_verified?: boolean | null
          id?: string
          image_urls?: string[] | null
          inferred_intent?: string | null
          intent_confidence?: number | null
          ip_address?: unknown
          is_edited?: boolean | null
          is_training_candidate?: boolean | null
          land_context?: Json | null
          language?: string | null
          location_context?: Json | null
          message_type?: string | null
          metadata?: Json | null
          off_topic?: boolean | null
          parent_message_id?: string | null
          partition_key?: number | null
          preprocessed_content?: string | null
          rainfall_zone?: string | null
          response_time_ms?: number | null
          role?: string
          session_id?: string
          soil_zone?: string | null
          status?: string | null
          tenant_id?: string
          tokens_used?: number | null
          training_processed?: boolean | null
          updated_at?: string | null
          user_agent?: string | null
          weather_context?: Json | null
          word_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_chat_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ai_chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_chat_sessions: {
        Row: {
          created_at: string
          farmer_id: string
          id: string
          is_active: boolean | null
          land_id: string | null
          metadata: Json | null
          session_title: string | null
          session_type: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          farmer_id: string
          id?: string
          is_active?: boolean | null
          land_id?: string | null
          metadata?: Json | null
          session_title?: string | null
          session_type?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          farmer_id?: string
          id?: string
          is_active?: boolean | null
          land_id?: string | null
          metadata?: Json | null
          session_title?: string | null
          session_type?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      ai_decision_log: {
        Row: {
          confidence_score: number | null
          created_at: string | null
          decision_type: string
          error_message: string | null
          execution_time_ms: number | null
          farmer_id: string | null
          feedback_comment: string | null
          feedback_score: number | null
          id: string
          input_data: Json
          land_id: string | null
          model_version: string | null
          ndvi_data: Json | null
          output_data: Json
          reasoning: string
          schedule_id: string | null
          soil_data: Json | null
          success: boolean | null
          tenant_id: string
          weather_data: Json | null
        }
        Insert: {
          confidence_score?: number | null
          created_at?: string | null
          decision_type: string
          error_message?: string | null
          execution_time_ms?: number | null
          farmer_id?: string | null
          feedback_comment?: string | null
          feedback_score?: number | null
          id?: string
          input_data: Json
          land_id?: string | null
          model_version?: string | null
          ndvi_data?: Json | null
          output_data: Json
          reasoning: string
          schedule_id?: string | null
          soil_data?: Json | null
          success?: boolean | null
          tenant_id: string
          weather_data?: Json | null
        }
        Update: {
          confidence_score?: number | null
          created_at?: string | null
          decision_type?: string
          error_message?: string | null
          execution_time_ms?: number | null
          farmer_id?: string | null
          feedback_comment?: string | null
          feedback_score?: number | null
          id?: string
          input_data?: Json
          land_id?: string | null
          model_version?: string | null
          ndvi_data?: Json | null
          output_data?: Json
          reasoning?: string
          schedule_id?: string | null
          soil_data?: Json | null
          success?: boolean | null
          tenant_id?: string
          weather_data?: Json | null
        }
        Relationships: []
      }
      ai_insights: {
        Row: {
          created_at: string
          data_source: Json | null
          description: string
          id: string
          impact_score: number | null
          insight_type: string
          is_resolved: boolean | null
          priority: string
          recommendation: string | null
          resolved_at: string | null
          resolved_by: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source?: Json | null
          description: string
          id?: string
          impact_score?: number | null
          insight_type: string
          is_resolved?: boolean | null
          priority?: string
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source?: Json | null
          description?: string
          id?: string
          impact_score?: number | null
          insight_type?: string
          is_resolved?: boolean | null
          priority?: string
          recommendation?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_insights_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_model_metrics: {
        Row: {
          accuracy_score: number | null
          avg_response_time_ms: number | null
          created_at: string | null
          error_rate: number | null
          id: string
          metadata: Json | null
          model_name: string
          model_version: string | null
          query_count: number | null
          resource_usage: Json | null
          tenant_id: string | null
          timestamp: string
        }
        Insert: {
          accuracy_score?: number | null
          avg_response_time_ms?: number | null
          created_at?: string | null
          error_rate?: number | null
          id?: string
          metadata?: Json | null
          model_name: string
          model_version?: string | null
          query_count?: number | null
          resource_usage?: Json | null
          tenant_id?: string | null
          timestamp?: string
        }
        Update: {
          accuracy_score?: number | null
          avg_response_time_ms?: number | null
          created_at?: string | null
          error_rate?: number | null
          id?: string
          metadata?: Json | null
          model_name?: string
          model_version?: string | null
          query_count?: number | null
          resource_usage?: Json | null
          tenant_id?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "ai_model_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_schedule_refinements: {
        Row: {
          ai_reasoning: string
          applied_at: string | null
          created_at: string | null
          farmer_id: string
          id: string
          land_id: string
          new_date: string | null
          original_date: string | null
          recommended_action: string
          refinement_type: string
          schedule_id: string
          severity: string | null
          status: string | null
          task_id: string | null
          tenant_id: string
          trigger_data: Json
        }
        Insert: {
          ai_reasoning: string
          applied_at?: string | null
          created_at?: string | null
          farmer_id: string
          id?: string
          land_id: string
          new_date?: string | null
          original_date?: string | null
          recommended_action: string
          refinement_type: string
          schedule_id: string
          severity?: string | null
          status?: string | null
          task_id?: string | null
          tenant_id: string
          trigger_data: Json
        }
        Update: {
          ai_reasoning?: string
          applied_at?: string | null
          created_at?: string | null
          farmer_id?: string
          id?: string
          land_id?: string
          new_date?: string | null
          original_date?: string | null
          recommended_action?: string
          refinement_type?: string
          schedule_id?: string
          severity?: string | null
          status?: string | null
          task_id?: string | null
          tenant_id?: string
          trigger_data?: Json
        }
        Relationships: []
      }
      ai_training_context: {
        Row: {
          context_data: Json
          context_type: string
          created_at: string
          farmer_id: string | null
          id: string
          is_active: boolean | null
          language: string | null
          message_id: string | null
          region: string
          source: string | null
          success_metrics: Json | null
          tenant_id: string
          updated_at: string
          validity_end: string | null
          validity_start: string | null
        }
        Insert: {
          context_data: Json
          context_type: string
          created_at?: string
          farmer_id?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          message_id?: string | null
          region: string
          source?: string | null
          success_metrics?: Json | null
          tenant_id: string
          updated_at?: string
          validity_end?: string | null
          validity_start?: string | null
        }
        Update: {
          context_data?: Json
          context_type?: string
          created_at?: string
          farmer_id?: string | null
          id?: string
          is_active?: boolean | null
          language?: string | null
          message_id?: string | null
          region?: string
          source?: string | null
          success_metrics?: Json | null
          tenant_id?: string
          updated_at?: string
          validity_end?: string | null
          validity_start?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_training_context_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "ai_chat_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      alert_notifications: {
        Row: {
          alert_type: string
          chat_message_id: string | null
          clicked_at: string | null
          created_at: string
          data: Json | null
          farmer_id: string
          id: string
          land_id: string | null
          message: string
          priority: string
          read_at: string | null
          sent_at: string
          tenant_id: string
          title: string
        }
        Insert: {
          alert_type: string
          chat_message_id?: string | null
          clicked_at?: string | null
          created_at?: string
          data?: Json | null
          farmer_id: string
          id?: string
          land_id?: string | null
          message: string
          priority?: string
          read_at?: string | null
          sent_at?: string
          tenant_id: string
          title: string
        }
        Update: {
          alert_type?: string
          chat_message_id?: string | null
          clicked_at?: string | null
          created_at?: string
          data?: Json | null
          farmer_id?: string
          id?: string
          land_id?: string | null
          message?: string
          priority?: string
          read_at?: string | null
          sent_at?: string
          tenant_id?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "alert_notifications_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "alert_notifications_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "alert_notifications_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "alert_notifications_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "alert_notifications_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "alert_notifications_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      analytics_reports: {
        Row: {
          end_date: string
          farmer_id: string
          file_url: string | null
          generated_at: string
          id: string
          metadata: Json | null
          report_data: Json
          report_period: string
          report_type: string
          start_date: string
          status: string | null
          tenant_id: string
        }
        Insert: {
          end_date: string
          farmer_id: string
          file_url?: string | null
          generated_at?: string
          id?: string
          metadata?: Json | null
          report_data: Json
          report_period: string
          report_type: string
          start_date: string
          status?: string | null
          tenant_id: string
        }
        Update: {
          end_date?: string
          farmer_id?: string
          file_url?: string | null
          generated_at?: string
          id?: string
          metadata?: Json | null
          report_data?: Json
          report_period?: string
          report_type?: string
          start_date?: string
          status?: string | null
          tenant_id?: string
        }
        Relationships: []
      }
      api_keys: {
        Row: {
          api_key_hash: string
          api_key_prefix: string
          created_at: string
          created_by: string | null
          expires_at: string | null
          id: string
          is_active: boolean
          key_name: string
          last_used_at: string | null
          permissions: Json
          rate_limit_per_hour: number
          tenant_id: string
          updated_at: string
        }
        Insert: {
          api_key_hash: string
          api_key_prefix: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_name: string
          last_used_at?: string | null
          permissions?: Json
          rate_limit_per_hour?: number
          tenant_id: string
          updated_at?: string
        }
        Update: {
          api_key_hash?: string
          api_key_prefix?: string
          created_at?: string
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_active?: boolean
          key_name?: string
          last_used_at?: string | null
          permissions?: Json
          rate_limit_per_hour?: number
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      api_logs: {
        Row: {
          api_key_id: string | null
          created_at: string
          endpoint: string
          error_message: string | null
          id: string
          ip_address: unknown
          method: string
          request_body: Json | null
          request_headers: Json | null
          response_body: Json | null
          response_headers: Json | null
          response_time_ms: number | null
          status_code: number
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          api_key_id?: string | null
          created_at?: string
          endpoint: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          method: string
          request_body?: Json | null
          request_headers?: Json | null
          response_body?: Json | null
          response_headers?: Json | null
          response_time_ms?: number | null
          status_code: number
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          api_key_id?: string | null
          created_at?: string
          endpoint?: string
          error_message?: string | null
          id?: string
          ip_address?: unknown
          method?: string
          request_body?: Json | null
          request_headers?: Json | null
          response_body?: Json | null
          response_headers?: Json | null
          response_time_ms?: number | null
          status_code?: number
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "api_logs_api_key_id_fkey"
            columns: ["api_key_id"]
            isOneToOne: false
            referencedRelation: "api_keys"
            referencedColumns: ["id"]
          },
        ]
      }
      app_versions: {
        Row: {
          app_key: string
          breaking_changes: Json | null
          bugs_fixed: Json | null
          build_hash: string
          created_at: string | null
          created_by: string | null
          deployed_at: string | null
          features_added: Json | null
          force_update: boolean | null
          id: string
          is_current: boolean | null
          metadata: Json | null
          min_supported_version: string | null
          release_notes: string | null
          update_policy: string | null
          version: string
        }
        Insert: {
          app_key: string
          breaking_changes?: Json | null
          bugs_fixed?: Json | null
          build_hash: string
          created_at?: string | null
          created_by?: string | null
          deployed_at?: string | null
          features_added?: Json | null
          force_update?: boolean | null
          id?: string
          is_current?: boolean | null
          metadata?: Json | null
          min_supported_version?: string | null
          release_notes?: string | null
          update_policy?: string | null
          version: string
        }
        Update: {
          app_key?: string
          breaking_changes?: Json | null
          bugs_fixed?: Json | null
          build_hash?: string
          created_at?: string | null
          created_by?: string | null
          deployed_at?: string | null
          features_added?: Json | null
          force_update?: boolean | null
          id?: string
          is_current?: boolean | null
          metadata?: Json | null
          min_supported_version?: string | null
          release_notes?: string | null
          update_policy?: string | null
          version?: string
        }
        Relationships: []
      }
      appearance_settings: {
        Row: {
          accent_color: string
          advanced_settings: Json | null
          analytics_config: Json | null
          animations_enabled: boolean | null
          api_settings: Json | null
          app_icon: string | null
          app_name: string | null
          app_splash_screen: string | null
          applied_at: string | null
          applied_by: string | null
          applies_to: string | null
          background_color: string
          border_color: string | null
          button_style: string | null
          card_style: string | null
          created_at: string | null
          custom_css: string | null
          custom_fonts: Json | null
          custom_scripts: Json | null
          email_templates: Json | null
          environment: string | null
          error_color: string | null
          favicon_url: string | null
          feature_toggles: Json | null
          font_family: string
          footer_links: Json | null
          footer_text: string | null
          header_config: Json | null
          id: string
          info_color: string | null
          input_style: string | null
          is_active: boolean | null
          language_settings: Json | null
          layout_config: Json | null
          logo_override_url: string | null
          maintenance_message: string | null
          maintenance_mode: boolean | null
          mobile_config: Json | null
          muted_color: string | null
          navigation_style: string | null
          notification_settings: Json | null
          preview_url: string | null
          primary_color: string
          primary_gradient: string | null
          secondary_color: string
          secondary_gradient: string | null
          seo_config: Json | null
          show_powered_by: boolean | null
          sidebar_background_color: string | null
          social_links: Json | null
          success_color: string | null
          tenant_id: string
          text_color: string
          theme_mode: string
          updated_at: string | null
          version: number | null
          warning_color: string | null
        }
        Insert: {
          accent_color?: string
          advanced_settings?: Json | null
          analytics_config?: Json | null
          animations_enabled?: boolean | null
          api_settings?: Json | null
          app_icon?: string | null
          app_name?: string | null
          app_splash_screen?: string | null
          applied_at?: string | null
          applied_by?: string | null
          applies_to?: string | null
          background_color?: string
          border_color?: string | null
          button_style?: string | null
          card_style?: string | null
          created_at?: string | null
          custom_css?: string | null
          custom_fonts?: Json | null
          custom_scripts?: Json | null
          email_templates?: Json | null
          environment?: string | null
          error_color?: string | null
          favicon_url?: string | null
          feature_toggles?: Json | null
          font_family?: string
          footer_links?: Json | null
          footer_text?: string | null
          header_config?: Json | null
          id?: string
          info_color?: string | null
          input_style?: string | null
          is_active?: boolean | null
          language_settings?: Json | null
          layout_config?: Json | null
          logo_override_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean | null
          mobile_config?: Json | null
          muted_color?: string | null
          navigation_style?: string | null
          notification_settings?: Json | null
          preview_url?: string | null
          primary_color?: string
          primary_gradient?: string | null
          secondary_color?: string
          secondary_gradient?: string | null
          seo_config?: Json | null
          show_powered_by?: boolean | null
          sidebar_background_color?: string | null
          social_links?: Json | null
          success_color?: string | null
          tenant_id: string
          text_color?: string
          theme_mode?: string
          updated_at?: string | null
          version?: number | null
          warning_color?: string | null
        }
        Update: {
          accent_color?: string
          advanced_settings?: Json | null
          analytics_config?: Json | null
          animations_enabled?: boolean | null
          api_settings?: Json | null
          app_icon?: string | null
          app_name?: string | null
          app_splash_screen?: string | null
          applied_at?: string | null
          applied_by?: string | null
          applies_to?: string | null
          background_color?: string
          border_color?: string | null
          button_style?: string | null
          card_style?: string | null
          created_at?: string | null
          custom_css?: string | null
          custom_fonts?: Json | null
          custom_scripts?: Json | null
          email_templates?: Json | null
          environment?: string | null
          error_color?: string | null
          favicon_url?: string | null
          feature_toggles?: Json | null
          font_family?: string
          footer_links?: Json | null
          footer_text?: string | null
          header_config?: Json | null
          id?: string
          info_color?: string | null
          input_style?: string | null
          is_active?: boolean | null
          language_settings?: Json | null
          layout_config?: Json | null
          logo_override_url?: string | null
          maintenance_message?: string | null
          maintenance_mode?: boolean | null
          mobile_config?: Json | null
          muted_color?: string | null
          navigation_style?: string | null
          notification_settings?: Json | null
          preview_url?: string | null
          primary_color?: string
          primary_gradient?: string | null
          secondary_color?: string
          secondary_gradient?: string | null
          seo_config?: Json | null
          show_powered_by?: boolean | null
          sidebar_background_color?: string | null
          social_links?: Json | null
          success_color?: string | null
          tenant_id?: string
          text_color?: string
          theme_mode?: string
          updated_at?: string | null
          version?: number | null
          warning_color?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "appearance_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      archived_data: {
        Row: {
          archived_at: string | null
          archived_data: Json
          created_at: string | null
          id: string
          original_id: string | null
          retention_expires_at: string | null
          source_table: string
        }
        Insert: {
          archived_at?: string | null
          archived_data: Json
          created_at?: string | null
          id?: string
          original_id?: string | null
          retention_expires_at?: string | null
          source_table: string
        }
        Update: {
          archived_at?: string | null
          archived_data?: Json
          created_at?: string | null
          id?: string
          original_id?: string | null
          retention_expires_at?: string | null
          source_table?: string
        }
        Relationships: []
      }
      audit_logs: {
        Row: {
          action_type: string
          created_at: string
          field_name: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          new_value: Json | null
          old_value: Json | null
          record_id: string
          table_name: string
          tenant_id: string
          user_agent: string | null
          user_email: string | null
          user_id: string
        }
        Insert: {
          action_type: string
          created_at?: string
          field_name?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          record_id: string
          table_name: string
          tenant_id: string
          user_agent?: string | null
          user_email?: string | null
          user_id: string
        }
        Update: {
          action_type?: string
          created_at?: string
          field_name?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          new_value?: Json | null
          old_value?: Json | null
          record_id?: string
          table_name?: string
          tenant_id?: string
          user_agent?: string | null
          user_email?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_analytics: {
        Row: {
          active_subscriptions: number | null
          arr: number | null
          average_revenue_per_user: number | null
          cancelled_subscriptions: number | null
          churn_rate: number | null
          contraction_revenue: number | null
          created_at: string | null
          expansion_revenue: number | null
          id: string
          ltv: number | null
          metadata: Json | null
          metric_date: string
          mrr: number | null
          new_subscriptions: number | null
          payment_success_rate: number | null
          tenant_id: string | null
        }
        Insert: {
          active_subscriptions?: number | null
          arr?: number | null
          average_revenue_per_user?: number | null
          cancelled_subscriptions?: number | null
          churn_rate?: number | null
          contraction_revenue?: number | null
          created_at?: string | null
          expansion_revenue?: number | null
          id?: string
          ltv?: number | null
          metadata?: Json | null
          metric_date: string
          mrr?: number | null
          new_subscriptions?: number | null
          payment_success_rate?: number | null
          tenant_id?: string | null
        }
        Update: {
          active_subscriptions?: number | null
          arr?: number | null
          average_revenue_per_user?: number | null
          cancelled_subscriptions?: number | null
          churn_rate?: number | null
          contraction_revenue?: number | null
          created_at?: string | null
          expansion_revenue?: number | null
          id?: string
          ltv?: number | null
          metadata?: Json | null
          metric_date?: string
          mrr?: number | null
          new_subscriptions?: number | null
          payment_success_rate?: number | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_automation_rules: {
        Row: {
          action_config: Json
          created_at: string | null
          execution_count: number | null
          id: string
          is_active: boolean | null
          last_executed_at: string | null
          rule_name: string
          rule_type: string
          trigger_condition: Json
          updated_at: string | null
        }
        Insert: {
          action_config: Json
          created_at?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_name: string
          rule_type: string
          trigger_condition: Json
          updated_at?: string | null
        }
        Update: {
          action_config?: Json
          created_at?: string | null
          execution_count?: number | null
          id?: string
          is_active?: boolean | null
          last_executed_at?: string | null
          rule_name?: string
          rule_type?: string
          trigger_condition?: Json
          updated_at?: string | null
        }
        Relationships: []
      }
      billing_notifications: {
        Row: {
          channel: string
          content: string | null
          created_at: string | null
          error_message: string | null
          id: string
          metadata: Json | null
          notification_type: string
          recipient: string
          sent_at: string | null
          status: string | null
          subject: string | null
          tenant_id: string | null
        }
        Insert: {
          channel: string
          content?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type: string
          recipient: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string | null
        }
        Update: {
          channel?: string
          content?: string | null
          created_at?: string | null
          error_message?: string | null
          id?: string
          metadata?: Json | null
          notification_type?: string
          recipient?: string
          sent_at?: string | null
          status?: string | null
          subject?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      billing_plans: {
        Row: {
          base_price: number
          billing_interval: string | null
          created_at: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          is_custom: boolean | null
          limits: Json | null
          name: string
          price_annually: number | null
          price_monthly: number | null
          price_quarterly: number | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          base_price?: number
          billing_interval?: string | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          limits?: Json | null
          name: string
          price_annually?: number | null
          price_monthly?: number | null
          price_quarterly?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          base_price?: number
          billing_interval?: string | null
          created_at?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          limits?: Json | null
          name?: string
          price_annually?: number | null
          price_monthly?: number | null
          price_quarterly?: number | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "billing_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      bulk_operations: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_log: Json | null
          failed_count: number | null
          id: string
          operation_data: Json
          operation_type: string
          processed_count: number | null
          status: string | null
          success_count: number | null
          target_farmer_ids: string[]
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_log?: Json | null
          failed_count?: number | null
          id?: string
          operation_data?: Json
          operation_type: string
          processed_count?: number | null
          status?: string | null
          success_count?: number | null
          target_farmer_ids: string[]
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_log?: Json | null
          failed_count?: number | null
          id?: string
          operation_data?: Json
          operation_type?: string
          processed_count?: number | null
          status?: string | null
          success_count?: number | null
          target_farmer_ids?: string[]
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "bulk_operations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_analytics: {
        Row: {
          bounce_rate: number | null
          campaign_id: string
          channel: string
          click_rate: number | null
          conversion_rate: number | null
          cost_per_message: number | null
          created_at: string | null
          customer_lifetime_value: number | null
          date_period: string
          engagement_score: number | null
          hour_period: number | null
          id: string
          messages_delivered: number | null
          messages_failed: number | null
          messages_sent: number | null
          open_rate: number | null
          revenue_generated: number | null
          roi: number | null
          tenant_id: string
          total_cost: number | null
          unsubscribe_rate: number | null
          updated_at: string | null
          viral_coefficient: number | null
        }
        Insert: {
          bounce_rate?: number | null
          campaign_id: string
          channel: string
          click_rate?: number | null
          conversion_rate?: number | null
          cost_per_message?: number | null
          created_at?: string | null
          customer_lifetime_value?: number | null
          date_period: string
          engagement_score?: number | null
          hour_period?: number | null
          id?: string
          messages_delivered?: number | null
          messages_failed?: number | null
          messages_sent?: number | null
          open_rate?: number | null
          revenue_generated?: number | null
          roi?: number | null
          tenant_id: string
          total_cost?: number | null
          unsubscribe_rate?: number | null
          updated_at?: string | null
          viral_coefficient?: number | null
        }
        Update: {
          bounce_rate?: number | null
          campaign_id?: string
          channel?: string
          click_rate?: number | null
          conversion_rate?: number | null
          cost_per_message?: number | null
          created_at?: string | null
          customer_lifetime_value?: number | null
          date_period?: string
          engagement_score?: number | null
          hour_period?: number | null
          id?: string
          messages_delivered?: number | null
          messages_failed?: number | null
          messages_sent?: number | null
          open_rate?: number | null
          revenue_generated?: number | null
          roi?: number | null
          tenant_id?: string
          total_cost?: number | null
          unsubscribe_rate?: number | null
          updated_at?: string | null
          viral_coefficient?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_analytics_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_automations: {
        Row: {
          automation_type: string
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          name: string
          success_rate: number | null
          tenant_id: string
          timing_config: Json | null
          total_executions: number | null
          trigger_conditions: Json
          updated_at: string | null
          workflow_steps: Json
        }
        Insert: {
          automation_type: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          success_rate?: number | null
          tenant_id: string
          timing_config?: Json | null
          total_executions?: number | null
          trigger_conditions?: Json
          updated_at?: string | null
          workflow_steps?: Json
        }
        Update: {
          automation_type?: string
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          success_rate?: number | null
          tenant_id?: string
          timing_config?: Json | null
          total_executions?: number | null
          trigger_conditions?: Json
          updated_at?: string | null
          workflow_steps?: Json
        }
        Relationships: []
      }
      campaign_executions: {
        Row: {
          campaign_id: string
          channel: string
          clicked_at: string | null
          conversion_value: number | null
          converted_at: string | null
          created_at: string | null
          delivered_at: string | null
          engagement_score: number | null
          error_message: string | null
          farmer_id: string | null
          id: string
          message_content: Json | null
          metadata: Json | null
          personalized_content: Json | null
          read_at: string | null
          retry_count: number | null
          sent_at: string | null
          status: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          campaign_id: string
          channel: string
          clicked_at?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          engagement_score?: number | null
          error_message?: string | null
          farmer_id?: string | null
          id?: string
          message_content?: Json | null
          metadata?: Json | null
          personalized_content?: Json | null
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          campaign_id?: string
          channel?: string
          clicked_at?: string | null
          conversion_value?: number | null
          converted_at?: string | null
          created_at?: string | null
          delivered_at?: string | null
          engagement_score?: number | null
          error_message?: string | null
          farmer_id?: string | null
          id?: string
          message_content?: Json | null
          metadata?: Json | null
          personalized_content?: Json | null
          read_at?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "campaign_executions_campaign_id_fkey"
            columns: ["campaign_id"]
            isOneToOne: false
            referencedRelation: "campaigns"
            referencedColumns: ["id"]
          },
        ]
      }
      campaign_segments: {
        Row: {
          behavioral_filters: Json | null
          created_at: string | null
          created_by: string | null
          criteria: Json
          crop_filters: Json | null
          description: string | null
          estimated_size: number | null
          exclusion_rules: Json | null
          geographic_filters: Json | null
          id: string
          is_active: boolean | null
          last_calculated_at: string | null
          logic_operator: string | null
          name: string
          segment_type: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          behavioral_filters?: Json | null
          created_at?: string | null
          created_by?: string | null
          criteria?: Json
          crop_filters?: Json | null
          description?: string | null
          estimated_size?: number | null
          exclusion_rules?: Json | null
          geographic_filters?: Json | null
          id?: string
          is_active?: boolean | null
          last_calculated_at?: string | null
          logic_operator?: string | null
          name: string
          segment_type?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          behavioral_filters?: Json | null
          created_at?: string | null
          created_by?: string | null
          criteria?: Json
          crop_filters?: Json | null
          description?: string | null
          estimated_size?: number | null
          exclusion_rules?: Json | null
          geographic_filters?: Json | null
          id?: string
          is_active?: boolean | null
          last_calculated_at?: string | null
          logic_operator?: string | null
          name?: string
          segment_type?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      campaign_templates: {
        Row: {
          category: string | null
          content: Json
          created_at: string | null
          created_by: string | null
          default_language: string | null
          description: string | null
          id: string
          is_active: boolean | null
          is_public: boolean | null
          language_versions: Json | null
          layout_config: Json | null
          name: string
          performance_score: number | null
          style_config: Json | null
          template_type: string
          tenant_id: string | null
          updated_at: string | null
          usage_count: number | null
        }
        Insert: {
          category?: string | null
          content?: Json
          created_at?: string | null
          created_by?: string | null
          default_language?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          language_versions?: Json | null
          layout_config?: Json | null
          name: string
          performance_score?: number | null
          style_config?: Json | null
          template_type: string
          tenant_id?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Update: {
          category?: string | null
          content?: Json
          created_at?: string | null
          created_by?: string | null
          default_language?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_public?: boolean | null
          language_versions?: Json | null
          layout_config?: Json | null
          name?: string
          performance_score?: number | null
          style_config?: Json | null
          template_type?: string
          tenant_id?: string | null
          updated_at?: string | null
          usage_count?: number | null
        }
        Relationships: []
      }
      campaigns: {
        Row: {
          ab_testing_config: Json | null
          automation_config: Json | null
          campaign_type: string
          channels: Json | null
          content_config: Json | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          is_automated: boolean | null
          metadata: Json | null
          name: string
          personalization_config: Json | null
          spent_budget: number | null
          start_date: string | null
          status: string
          tags: Json | null
          target_audience_size: number | null
          tenant_id: string
          timezone: string | null
          total_budget: number | null
          trigger_config: Json | null
          updated_at: string | null
        }
        Insert: {
          ab_testing_config?: Json | null
          automation_config?: Json | null
          campaign_type: string
          channels?: Json | null
          content_config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_automated?: boolean | null
          metadata?: Json | null
          name: string
          personalization_config?: Json | null
          spent_budget?: number | null
          start_date?: string | null
          status?: string
          tags?: Json | null
          target_audience_size?: number | null
          tenant_id: string
          timezone?: string | null
          total_budget?: number | null
          trigger_config?: Json | null
          updated_at?: string | null
        }
        Update: {
          ab_testing_config?: Json | null
          automation_config?: Json | null
          campaign_type?: string
          channels?: Json | null
          content_config?: Json | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          is_automated?: boolean | null
          metadata?: Json | null
          name?: string
          personalization_config?: Json | null
          spent_budget?: number | null
          start_date?: string | null
          status?: string
          tags?: Json | null
          target_audience_size?: number | null
          tenant_id?: string
          timezone?: string | null
          total_budget?: number | null
          trigger_config?: Json | null
          updated_at?: string | null
        }
        Relationships: []
      }
      cart_items: {
        Row: {
          added_at: string
          cart_id: string
          farmer_id: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          added_at?: string
          cart_id: string
          farmer_id: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          tenant_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          added_at?: string
          cart_id?: string
          farmer_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cart_items_cart_id_fkey"
            columns: ["cart_id"]
            isOneToOne: false
            referencedRelation: "shopping_carts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "cart_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cart_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      collaborative_notes: {
        Row: {
          assigned_to: string | null
          attachments: Json | null
          completed_at: string | null
          content: string
          created_at: string | null
          created_by: string
          due_date: string | null
          field_id: string | null
          id: string
          is_completed: boolean | null
          last_edited_by: string | null
          location: Json | null
          note_type: string
          organization_id: string
          priority: string | null
          tags: Json | null
          title: string
          updated_at: string | null
        }
        Insert: {
          assigned_to?: string | null
          attachments?: Json | null
          completed_at?: string | null
          content: string
          created_at?: string | null
          created_by: string
          due_date?: string | null
          field_id?: string | null
          id?: string
          is_completed?: boolean | null
          last_edited_by?: string | null
          location?: Json | null
          note_type?: string
          organization_id: string
          priority?: string | null
          tags?: Json | null
          title: string
          updated_at?: string | null
        }
        Update: {
          assigned_to?: string | null
          attachments?: Json | null
          completed_at?: string | null
          content?: string
          created_at?: string | null
          created_by?: string
          due_date?: string | null
          field_id?: string | null
          id?: string
          is_completed?: boolean | null
          last_edited_by?: string | null
          location?: Json | null
          note_type?: string
          organization_id?: string
          priority?: string | null
          tags?: Json | null
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      commodity_master: {
        Row: {
          aliases: Json | null
          category: string | null
          created_at: string | null
          global_code: string
          id: string
          name: string
          unit: string | null
          updated_at: string | null
        }
        Insert: {
          aliases?: Json | null
          category?: string | null
          created_at?: string | null
          global_code: string
          id?: string
          name: string
          unit?: string | null
          updated_at?: string | null
        }
        Update: {
          aliases?: Json | null
          category?: string | null
          created_at?: string | null
          global_code?: string
          id?: string
          name?: string
          unit?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      communities: {
        Row: {
          banner_url: string | null
          community_type: Database["public"]["Enums"]["community_type"]
          cover_image_url: string | null
          created_at: string | null
          created_by: string | null
          crop_id: string | null
          description: string | null
          icon_url: string | null
          id: string
          is_active: boolean | null
          is_global: boolean | null
          is_verified: boolean | null
          language: string | null
          language_code: string | null
          member_count: number | null
          metadata: Json | null
          moderator_ids: string[] | null
          name: string
          pinned_posts: string[] | null
          post_count: number | null
          rules: string | null
          slug: string
          state_code: string | null
          tags: string[] | null
          tenant_id: string | null
          trending_score: number | null
          updated_at: string | null
        }
        Insert: {
          banner_url?: string | null
          community_type: Database["public"]["Enums"]["community_type"]
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          crop_id?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          language_code?: string | null
          member_count?: number | null
          metadata?: Json | null
          moderator_ids?: string[] | null
          name: string
          pinned_posts?: string[] | null
          post_count?: number | null
          rules?: string | null
          slug: string
          state_code?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          trending_score?: number | null
          updated_at?: string | null
        }
        Update: {
          banner_url?: string | null
          community_type?: Database["public"]["Enums"]["community_type"]
          cover_image_url?: string | null
          created_at?: string | null
          created_by?: string | null
          crop_id?: string | null
          description?: string | null
          icon_url?: string | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          is_verified?: boolean | null
          language?: string | null
          language_code?: string | null
          member_count?: number | null
          metadata?: Json | null
          moderator_ids?: string[] | null
          name?: string
          pinned_posts?: string[] | null
          post_count?: number | null
          rules?: string | null
          slug?: string
          state_code?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          trending_score?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "communities_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "communities_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_events: {
        Row: {
          attendees: string[] | null
          community_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_time: string | null
          event_type: string | null
          id: string
          is_online: boolean | null
          location: string | null
          meeting_link: string | null
          start_time: string | null
          title: string
        }
        Insert: {
          attendees?: string[] | null
          community_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          is_online?: boolean | null
          location?: string | null
          meeting_link?: string | null
          start_time?: string | null
          title: string
        }
        Update: {
          attendees?: string[] | null
          community_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          event_type?: string | null
          id?: string
          is_online?: boolean | null
          location?: string | null
          meeting_link?: string | null
          start_time?: string | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "community_events_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_events_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      community_member_activity: {
        Row: {
          activity_type: string
          badges: Json | null
          community_id: string | null
          created_at: string | null
          farmer_id: string | null
          helpful_answers: number | null
          id: string
          last_active: string | null
          level: number | null
          points: number | null
          streak_days: number | null
          total_messages: number | null
        }
        Insert: {
          activity_type: string
          badges?: Json | null
          community_id?: string | null
          created_at?: string | null
          farmer_id?: string | null
          helpful_answers?: number | null
          id?: string
          last_active?: string | null
          level?: number | null
          points?: number | null
          streak_days?: number | null
          total_messages?: number | null
        }
        Update: {
          activity_type?: string
          badges?: Json | null
          community_id?: string | null
          created_at?: string | null
          farmer_id?: string | null
          helpful_answers?: number | null
          id?: string
          last_active?: string | null
          level?: number | null
          points?: number | null
          streak_days?: number | null
          total_messages?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "community_member_activity_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_member_activity_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_member_activity_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      community_members: {
        Row: {
          community_id: string
          contribution_points: number | null
          farmer_id: string
          id: string
          is_active: boolean | null
          joined_at: string | null
          role: string | null
        }
        Insert: {
          community_id: string
          contribution_points?: number | null
          farmer_id: string
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          role?: string | null
        }
        Update: {
          community_id?: string
          contribution_points?: number | null
          farmer_id?: string
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_members_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_members_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      community_messages: {
        Row: {
          attachments: Json | null
          community_id: string | null
          content: string
          created_at: string | null
          edited_at: string | null
          farmer_id: string | null
          id: string
          is_ai_filtered: boolean | null
          is_edited: boolean | null
          is_pinned: boolean | null
          is_verified: boolean | null
          message_type: string | null
          metadata: Json | null
          parent_message_id: string | null
          reactions: Json | null
          read_by: Json | null
          tenant_id: string | null
          translation_data: Json | null
          updated_at: string | null
        }
        Insert: {
          attachments?: Json | null
          community_id?: string | null
          content: string
          created_at?: string | null
          edited_at?: string | null
          farmer_id?: string | null
          id?: string
          is_ai_filtered?: boolean | null
          is_edited?: boolean | null
          is_pinned?: boolean | null
          is_verified?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          parent_message_id?: string | null
          reactions?: Json | null
          read_by?: Json | null
          tenant_id?: string | null
          translation_data?: Json | null
          updated_at?: string | null
        }
        Update: {
          attachments?: Json | null
          community_id?: string | null
          content?: string
          created_at?: string | null
          edited_at?: string | null
          farmer_id?: string | null
          id?: string
          is_ai_filtered?: boolean | null
          is_edited?: boolean | null
          is_pinned?: boolean | null
          is_verified?: boolean | null
          message_type?: string | null
          metadata?: Json | null
          parent_message_id?: string | null
          reactions?: Json | null
          read_by?: Json | null
          tenant_id?: string | null
          translation_data?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_messages_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "community_messages_parent_message_id_fkey"
            columns: ["parent_message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_messages_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      community_moderation: {
        Row: {
          action_type: string
          community_id: string | null
          created_at: string | null
          id: string
          moderator_id: string | null
          reason: string | null
          target_message_id: string | null
          target_user_id: string | null
        }
        Insert: {
          action_type: string
          community_id?: string | null
          created_at?: string | null
          id?: string
          moderator_id?: string | null
          reason?: string | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Update: {
          action_type?: string
          community_id?: string | null
          created_at?: string | null
          id?: string
          moderator_id?: string | null
          reason?: string | null
          target_message_id?: string | null
          target_user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "community_moderation_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_moderator_id_fkey"
            columns: ["moderator_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "community_moderation_target_message_id_fkey"
            columns: ["target_message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_moderation_target_user_id_fkey"
            columns: ["target_user_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      community_polls: {
        Row: {
          allow_multiple: boolean | null
          community_id: string | null
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          id: string
          is_anonymous: boolean | null
          message_id: string | null
          options: Json
          question: string
          votes: Json | null
        }
        Insert: {
          allow_multiple?: boolean | null
          community_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          message_id?: string | null
          options: Json
          question: string
          votes?: Json | null
        }
        Update: {
          allow_multiple?: boolean | null
          community_id?: string | null
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          id?: string
          is_anonymous?: boolean | null
          message_id?: string | null
          options?: Json
          question?: string
          votes?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "community_polls_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "community_polls_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "community_polls_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "community_messages"
            referencedColumns: ["id"]
          },
        ]
      }
      content_moderation: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          reason: string | null
          reported_by: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          reason?: string | null
          reported_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          reason?: string | null
          reported_by?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_moderation_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_moderation_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "content_moderation_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_moderation_reviewed_by_fkey"
            columns: ["reviewed_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      content_reports: {
        Row: {
          content_id: string
          content_type: string
          created_at: string | null
          id: string
          moderator_id: string | null
          moderator_notes: string | null
          report_details: string | null
          report_reason: string
          reported_by: string
          resolved_at: string | null
          status: string | null
        }
        Insert: {
          content_id: string
          content_type: string
          created_at?: string | null
          id?: string
          moderator_id?: string | null
          moderator_notes?: string | null
          report_details?: string | null
          report_reason: string
          reported_by: string
          resolved_at?: string | null
          status?: string | null
        }
        Update: {
          content_id?: string
          content_type?: string
          created_at?: string | null
          id?: string
          moderator_id?: string | null
          moderator_notes?: string | null
          report_details?: string | null
          report_reason?: string
          reported_by?: string
          resolved_at?: string | null
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "content_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "content_reports_reported_by_fkey"
            columns: ["reported_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      copernicus_api_calls: {
        Row: {
          api_type: string
          bbox_area_km2: number | null
          bbox_requested: Json
          cluster_id: string | null
          cost_estimate: number | null
          created_at: string | null
          data_size_mb: number | null
          error_message: string | null
          id: string
          land_id: string | null
          pixels_requested: number | null
          processing_units: number | null
          request_payload: Json | null
          response_metadata: Json | null
          response_time_ms: number | null
          success: boolean
          tenant_id: string | null
        }
        Insert: {
          api_type: string
          bbox_area_km2?: number | null
          bbox_requested: Json
          cluster_id?: string | null
          cost_estimate?: number | null
          created_at?: string | null
          data_size_mb?: number | null
          error_message?: string | null
          id?: string
          land_id?: string | null
          pixels_requested?: number | null
          processing_units?: number | null
          request_payload?: Json | null
          response_metadata?: Json | null
          response_time_ms?: number | null
          success: boolean
          tenant_id?: string | null
        }
        Update: {
          api_type?: string
          bbox_area_km2?: number | null
          bbox_requested?: Json
          cluster_id?: string | null
          cost_estimate?: number | null
          created_at?: string | null
          data_size_mb?: number | null
          error_message?: string | null
          id?: string
          land_id?: string | null
          pixels_requested?: number | null
          processing_units?: number | null
          request_payload?: Json | null
          response_metadata?: Json | null
          response_time_ms?: number | null
          success?: boolean
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "copernicus_api_calls_cluster_id_fkey"
            columns: ["cluster_id"]
            isOneToOne: false
            referencedRelation: "land_clusters"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copernicus_api_calls_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "copernicus_api_calls_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "copernicus_api_calls_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "copernicus_api_calls_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "copernicus_api_calls_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "copernicus_api_calls_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "copernicus_api_calls_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      countries: {
        Row: {
          code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      coupon_redemptions: {
        Row: {
          coupon_id: string
          discount_applied: number
          farmer_id: string | null
          id: string
          invoice_id: string | null
          metadata: Json | null
          redeemed_at: string
          subscription_id: string | null
          tenant_id: string | null
        }
        Insert: {
          coupon_id: string
          discount_applied: number
          farmer_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          redeemed_at?: string
          subscription_id?: string | null
          tenant_id?: string | null
        }
        Update: {
          coupon_id?: string
          discount_applied?: number
          farmer_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          redeemed_at?: string
          subscription_id?: string | null
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "coupon_redemptions_coupon_id_fkey"
            columns: ["coupon_id"]
            isOneToOne: false
            referencedRelation: "subscription_coupons"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "coupon_redemptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_notes: {
        Row: {
          amount: number
          applied_at: string | null
          created_at: string
          credit_note_number: string
          currency: string
          id: string
          invoice_id: string | null
          issued_at: string | null
          metadata: Json | null
          notes: string | null
          reason: string | null
          status: string
          stripe_credit_note_id: string | null
          tenant_id: string
          type: string
          updated_at: string
        }
        Insert: {
          amount: number
          applied_at?: string | null
          created_at?: string
          credit_note_number: string
          currency?: string
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          metadata?: Json | null
          notes?: string | null
          reason?: string | null
          status?: string
          stripe_credit_note_id?: string | null
          tenant_id: string
          type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          applied_at?: string | null
          created_at?: string
          credit_note_number?: string
          currency?: string
          id?: string
          invoice_id?: string | null
          issued_at?: string | null
          metadata?: Json | null
          notes?: string | null
          reason?: string | null
          status?: string
          stripe_credit_note_id?: string | null
          tenant_id?: string
          type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "credit_notes_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_baseline_guidelines: {
        Row: {
          best_practices: string | null
          climate_zone: string | null
          common_diseases: Json | null
          common_pests: Json | null
          confidence_level: string | null
          created_at: string | null
          crop_name: string
          crop_variety: string | null
          fertilizer_schedule: Json | null
          growth_duration_days: number
          id: string
          is_active: boolean | null
          optimal_temp_max: number | null
          optimal_temp_min: number | null
          region: string | null
          soil_type: string | null
          source: string | null
          stages: Json
          updated_at: string | null
          water_requirement_mm: number | null
        }
        Insert: {
          best_practices?: string | null
          climate_zone?: string | null
          common_diseases?: Json | null
          common_pests?: Json | null
          confidence_level?: string | null
          created_at?: string | null
          crop_name: string
          crop_variety?: string | null
          fertilizer_schedule?: Json | null
          growth_duration_days: number
          id?: string
          is_active?: boolean | null
          optimal_temp_max?: number | null
          optimal_temp_min?: number | null
          region?: string | null
          soil_type?: string | null
          source?: string | null
          stages: Json
          updated_at?: string | null
          water_requirement_mm?: number | null
        }
        Update: {
          best_practices?: string | null
          climate_zone?: string | null
          common_diseases?: Json | null
          common_pests?: Json | null
          confidence_level?: string | null
          created_at?: string | null
          crop_name?: string
          crop_variety?: string | null
          fertilizer_schedule?: Json | null
          growth_duration_days?: number
          id?: string
          is_active?: boolean | null
          optimal_temp_max?: number | null
          optimal_temp_min?: number | null
          region?: string | null
          soil_type?: string | null
          source?: string | null
          stages?: Json
          updated_at?: string | null
          water_requirement_mm?: number | null
        }
        Relationships: []
      }
      crop_groups: {
        Row: {
          created_at: string
          description: string | null
          display_order: number
          group_icon: string
          group_key: string
          group_name: string
          group_name_hi: string | null
          group_name_mr: string | null
          id: string
          is_active: boolean
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          display_order?: number
          group_icon?: string
          group_key: string
          group_name: string
          group_name_hi?: string | null
          group_name_mr?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          display_order?: number
          group_icon?: string
          group_key?: string
          group_name?: string
          group_name_hi?: string | null
          group_name_mr?: string | null
          id?: string
          is_active?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      crop_growth_alerts: {
        Row: {
          action_deadline: string | null
          actioned_at: string | null
          alert_category: string
          alert_type: string
          analysis_id: string | null
          created_at: string
          dismissed_at: string | null
          expires_at: string | null
          farmer_id: string
          id: string
          is_actioned: boolean | null
          is_read: boolean | null
          land_id: string
          message: string
          recommended_action: string | null
          severity: string
          tenant_id: string
          title: string
          trigger_conditions: Json | null
        }
        Insert: {
          action_deadline?: string | null
          actioned_at?: string | null
          alert_category: string
          alert_type: string
          analysis_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string | null
          farmer_id: string
          id?: string
          is_actioned?: boolean | null
          is_read?: boolean | null
          land_id: string
          message: string
          recommended_action?: string | null
          severity: string
          tenant_id: string
          title: string
          trigger_conditions?: Json | null
        }
        Update: {
          action_deadline?: string | null
          actioned_at?: string | null
          alert_category?: string
          alert_type?: string
          analysis_id?: string | null
          created_at?: string
          dismissed_at?: string | null
          expires_at?: string | null
          farmer_id?: string
          id?: string
          is_actioned?: boolean | null
          is_read?: boolean | null
          land_id?: string
          message?: string
          recommended_action?: string | null
          severity?: string
          tenant_id?: string
          title?: string
          trigger_conditions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_growth_alerts_analysis_id_fkey"
            columns: ["analysis_id"]
            isOneToOne: false
            referencedRelation: "crop_growth_analysis"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "crop_growth_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "crop_growth_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_growth_analysis: {
        Row: {
          ai_model_used: string | null
          canopy_health_score: number | null
          confidence_score: number | null
          conflicting_signals: Json | null
          created_at: string
          crop_current_status: string
          detected_growth_stage: string | null
          detected_issues: Json | null
          expected_growth_stage: string | null
          farmer_id: string
          farmer_message: string
          farmer_message_language: string | null
          growth_stage_deviation: string | null
          id: string
          land_id: string
          ndvi_weather_correlation: string | null
          next_14_day_prediction: string | null
          next_3_day_prediction: string | null
          next_7_day_prediction: string | null
          processing_time_ms: number | null
          recommended_actions: Json
          risk_factors: Json | null
          risk_level: string | null
          schedule_updates: Json | null
          signal_confidence: string | null
          tenant_id: string
          uniformity_score: number | null
          upload_id: string
          visual_observation_summary: string
          yield_impact_estimate: string | null
        }
        Insert: {
          ai_model_used?: string | null
          canopy_health_score?: number | null
          confidence_score?: number | null
          conflicting_signals?: Json | null
          created_at?: string
          crop_current_status: string
          detected_growth_stage?: string | null
          detected_issues?: Json | null
          expected_growth_stage?: string | null
          farmer_id: string
          farmer_message: string
          farmer_message_language?: string | null
          growth_stage_deviation?: string | null
          id?: string
          land_id: string
          ndvi_weather_correlation?: string | null
          next_14_day_prediction?: string | null
          next_3_day_prediction?: string | null
          next_7_day_prediction?: string | null
          processing_time_ms?: number | null
          recommended_actions: Json
          risk_factors?: Json | null
          risk_level?: string | null
          schedule_updates?: Json | null
          signal_confidence?: string | null
          tenant_id: string
          uniformity_score?: number | null
          upload_id: string
          visual_observation_summary: string
          yield_impact_estimate?: string | null
        }
        Update: {
          ai_model_used?: string | null
          canopy_health_score?: number | null
          confidence_score?: number | null
          conflicting_signals?: Json | null
          created_at?: string
          crop_current_status?: string
          detected_growth_stage?: string | null
          detected_issues?: Json | null
          expected_growth_stage?: string | null
          farmer_id?: string
          farmer_message?: string
          farmer_message_language?: string | null
          growth_stage_deviation?: string | null
          id?: string
          land_id?: string
          ndvi_weather_correlation?: string | null
          next_14_day_prediction?: string | null
          next_3_day_prediction?: string | null
          next_7_day_prediction?: string | null
          processing_time_ms?: number | null
          recommended_actions?: Json
          risk_factors?: Json | null
          risk_level?: string | null
          schedule_updates?: Json | null
          signal_confidence?: string | null
          tenant_id?: string
          uniformity_score?: number | null
          upload_id?: string
          visual_observation_summary?: string
          yield_impact_estimate?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_growth_analysis_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_analysis_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "crop_growth_analysis_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "crop_growth_analysis_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_analysis_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_analysis_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_analysis_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_analysis_upload_id_fkey"
            columns: ["upload_id"]
            isOneToOne: false
            referencedRelation: "crop_growth_uploads"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_growth_history: {
        Row: {
          created_at: string
          farmer_id: string
          growth_stage: string | null
          health_score: number | null
          id: string
          issues_detected: number | null
          land_id: string
          ndvi_value: number | null
          record_date: string
          tenant_id: string
          weather_summary: Json | null
        }
        Insert: {
          created_at?: string
          farmer_id: string
          growth_stage?: string | null
          health_score?: number | null
          id?: string
          issues_detected?: number | null
          land_id: string
          ndvi_value?: number | null
          record_date: string
          tenant_id: string
          weather_summary?: Json | null
        }
        Update: {
          created_at?: string
          farmer_id?: string
          growth_stage?: string | null
          health_score?: number | null
          id?: string
          issues_detected?: number | null
          land_id?: string
          ndvi_value?: number | null
          record_date?: string
          tenant_id?: string
          weather_summary?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_growth_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "crop_growth_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "crop_growth_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_growth_uploads: {
        Row: {
          capture_location: Json | null
          created_at: string
          distance_from_land_meters: number | null
          farmer_id: string
          file_type: string
          file_url: string
          id: string
          is_processed: boolean | null
          land_id: string
          location_validated: boolean | null
          ndvi_at_capture: number | null
          notes: string | null
          processing_error: string | null
          schedule_id: string | null
          task_id: string | null
          tenant_id: string
          thumbnail_url: string | null
          updated_at: string
          upload_timestamp: string
          upload_type: string | null
          weather_at_capture: Json | null
        }
        Insert: {
          capture_location?: Json | null
          created_at?: string
          distance_from_land_meters?: number | null
          farmer_id: string
          file_type: string
          file_url: string
          id?: string
          is_processed?: boolean | null
          land_id: string
          location_validated?: boolean | null
          ndvi_at_capture?: number | null
          notes?: string | null
          processing_error?: string | null
          schedule_id?: string | null
          task_id?: string | null
          tenant_id: string
          thumbnail_url?: string | null
          updated_at?: string
          upload_timestamp?: string
          upload_type?: string | null
          weather_at_capture?: Json | null
        }
        Update: {
          capture_location?: Json | null
          created_at?: string
          distance_from_land_meters?: number | null
          farmer_id?: string
          file_type?: string
          file_url?: string
          id?: string
          is_processed?: boolean | null
          land_id?: string
          location_validated?: boolean | null
          ndvi_at_capture?: number | null
          notes?: string | null
          processing_error?: string | null
          schedule_id?: string | null
          task_id?: string | null
          tenant_id?: string
          thumbnail_url?: string | null
          updated_at?: string
          upload_timestamp?: string
          upload_type?: string | null
          weather_at_capture?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_growth_uploads_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "crop_schedules"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "farmer_upcoming_needs"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_growth_uploads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_health_assessments: {
        Row: {
          alert_level: string | null
          assessment_date: string
          comparison_data: Json | null
          created_at: string | null
          growth_stage: string | null
          id: string
          land_id: string
          ndvi_avg: number | null
          ndvi_max: number | null
          ndvi_min: number | null
          ndvi_std: number | null
          overall_health_score: number | null
          predicted_yield: number | null
          problem_areas: Json | null
          recommendations: Json | null
          stress_indicators: Json | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          alert_level?: string | null
          assessment_date: string
          comparison_data?: Json | null
          created_at?: string | null
          growth_stage?: string | null
          id?: string
          land_id: string
          ndvi_avg?: number | null
          ndvi_max?: number | null
          ndvi_min?: number | null
          ndvi_std?: number | null
          overall_health_score?: number | null
          predicted_yield?: number | null
          problem_areas?: Json | null
          recommendations?: Json | null
          stress_indicators?: Json | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          alert_level?: string | null
          assessment_date?: string
          comparison_data?: Json | null
          created_at?: string | null
          growth_stage?: string | null
          id?: string
          land_id?: string
          ndvi_avg?: number | null
          ndvi_max?: number | null
          ndvi_min?: number | null
          ndvi_std?: number | null
          overall_health_score?: number | null
          predicted_yield?: number | null
          problem_areas?: Json | null
          recommendations?: Json | null
          stress_indicators?: Json | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_health_assessments_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_health_assessments_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "crop_health_assessments_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "crop_health_assessments_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_health_assessments_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_health_assessments_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "fk_crop_health_assessments_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_history: {
        Row: {
          created_at: string
          crop_name: string
          growth_stage: string | null
          harvest_date: string | null
          id: string
          land_id: string
          notes: string | null
          planting_date: string | null
          season: string | null
          status: string | null
          tenant_id: string
          updated_at: string
          variety: string | null
          yield_kg_per_acre: number | null
        }
        Insert: {
          created_at?: string
          crop_name: string
          growth_stage?: string | null
          harvest_date?: string | null
          id?: string
          land_id: string
          notes?: string | null
          planting_date?: string | null
          season?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string
          variety?: string | null
          yield_kg_per_acre?: number | null
        }
        Update: {
          created_at?: string
          crop_name?: string
          growth_stage?: string | null
          harvest_date?: string | null
          id?: string
          land_id?: string
          notes?: string | null
          planting_date?: string | null
          season?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string
          variety?: string | null
          yield_kg_per_acre?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "crop_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "crop_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_history_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "fk_crop_history_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      crop_schedules: {
        Row: {
          actual_harvest_date: string | null
          actual_profit: number | null
          actual_total_cost: number | null
          actual_yield_quintals: number | null
          agro_climatic_zone: string | null
          ai_model: string | null
          backdated_consent: boolean | null
          backdated_consent_at: string | null
          bio_fertilizer_units: number | null
          bio_pesticide_ml: number | null
          calculated_for_area_acres: number | null
          completed_at: string | null
          cost_by_category: Json | null
          cost_by_stage: Json | null
          country: string | null
          created_at: string | null
          crop_name: string
          crop_variety: string | null
          data_quality_score: number | null
          district_name: string | null
          expected_gross_revenue: number | null
          expected_harvest_date: string | null
          expected_market_price_per_quintal: number | null
          expected_net_profit: number | null
          expected_profit: number | null
          expected_yield_per_acre: number | null
          expected_yield_quintals: number | null
          farmer_feedback: string | null
          farmer_id: string
          farmer_rating: number | null
          farming_type: string | null
          fertilizer_k_kg: number | null
          fertilizer_n_kg: number | null
          fertilizer_p_kg: number | null
          fungicide_gm: number | null
          generated_at: string | null
          generation_language: string | null
          generation_params: Json | null
          growth_regulators: Json | null
          herbicide_ml: number | null
          id: string
          input_land_coordinates: Json | null
          input_soil_data: Json | null
          input_weather_data: Json | null
          insecticide_ml: number | null
          intercrop_2_area_percent: number | null
          intercrop_2_name: string | null
          intercrop_2_sowing_date: string | null
          intercrop_2_variety: string | null
          intercrop_3_area_percent: number | null
          intercrop_3_name: string | null
          intercrop_3_sowing_date: string | null
          intercrop_3_variety: string | null
          intercrop_area_percent: number | null
          intercrop_name: string | null
          intercrop_sowing_date: string | null
          intercrop_variety: string | null
          irrigation_count_total: number | null
          is_active: boolean | null
          is_training_candidate: boolean | null
          labor_rate_used: number | null
          land_id: string
          last_weather_check: string | null
          last_weather_update: string | null
          metadata: Json | null
          organic_fertilizer_kg: number | null
          organic_input_details: Json | null
          organic_manure_kg: number | null
          outcome_recorded_at: string | null
          pesticide_requirements: Json | null
          pgr_hormone_ml: number | null
          products_recommended_count: number | null
          recommendation_order: string | null
          recommended_products: Json | null
          regional_dialect_zone: string | null
          schedule_accuracy_score: number | null
          schedule_version: number | null
          seed_quantity_kg: number | null
          sowing_date: string
          stages_covered: Json | null
          state_region: string | null
          status: string | null
          suitability_score: number | null
          suitability_warnings: Json | null
          taluka_name: string | null
          tasks_completed_count: number | null
          tasks_on_time_count: number | null
          tasks_total_count: number | null
          tenant_id: string
          total_duration_days: number | null
          total_estimated_cost: number | null
          total_labor_cost: number | null
          total_material_cost: number | null
          total_water_requirement_liters: number | null
          training_batch_id: string | null
          training_excluded_reason: string | null
          training_processed: boolean | null
          updated_at: string | null
          vermicompost_kg: number | null
          water_per_irrigation_liters: number | null
          water_requirement_liters_total: number | null
          weather_auto_update_enabled: boolean | null
          weather_data: Json | null
          yield_boosting_techniques: Json | null
          yield_multiplier_target: number | null
        }
        Insert: {
          actual_harvest_date?: string | null
          actual_profit?: number | null
          actual_total_cost?: number | null
          actual_yield_quintals?: number | null
          agro_climatic_zone?: string | null
          ai_model?: string | null
          backdated_consent?: boolean | null
          backdated_consent_at?: string | null
          bio_fertilizer_units?: number | null
          bio_pesticide_ml?: number | null
          calculated_for_area_acres?: number | null
          completed_at?: string | null
          cost_by_category?: Json | null
          cost_by_stage?: Json | null
          country?: string | null
          created_at?: string | null
          crop_name: string
          crop_variety?: string | null
          data_quality_score?: number | null
          district_name?: string | null
          expected_gross_revenue?: number | null
          expected_harvest_date?: string | null
          expected_market_price_per_quintal?: number | null
          expected_net_profit?: number | null
          expected_profit?: number | null
          expected_yield_per_acre?: number | null
          expected_yield_quintals?: number | null
          farmer_feedback?: string | null
          farmer_id: string
          farmer_rating?: number | null
          farming_type?: string | null
          fertilizer_k_kg?: number | null
          fertilizer_n_kg?: number | null
          fertilizer_p_kg?: number | null
          fungicide_gm?: number | null
          generated_at?: string | null
          generation_language?: string | null
          generation_params?: Json | null
          growth_regulators?: Json | null
          herbicide_ml?: number | null
          id?: string
          input_land_coordinates?: Json | null
          input_soil_data?: Json | null
          input_weather_data?: Json | null
          insecticide_ml?: number | null
          intercrop_2_area_percent?: number | null
          intercrop_2_name?: string | null
          intercrop_2_sowing_date?: string | null
          intercrop_2_variety?: string | null
          intercrop_3_area_percent?: number | null
          intercrop_3_name?: string | null
          intercrop_3_sowing_date?: string | null
          intercrop_3_variety?: string | null
          intercrop_area_percent?: number | null
          intercrop_name?: string | null
          intercrop_sowing_date?: string | null
          intercrop_variety?: string | null
          irrigation_count_total?: number | null
          is_active?: boolean | null
          is_training_candidate?: boolean | null
          labor_rate_used?: number | null
          land_id: string
          last_weather_check?: string | null
          last_weather_update?: string | null
          metadata?: Json | null
          organic_fertilizer_kg?: number | null
          organic_input_details?: Json | null
          organic_manure_kg?: number | null
          outcome_recorded_at?: string | null
          pesticide_requirements?: Json | null
          pgr_hormone_ml?: number | null
          products_recommended_count?: number | null
          recommendation_order?: string | null
          recommended_products?: Json | null
          regional_dialect_zone?: string | null
          schedule_accuracy_score?: number | null
          schedule_version?: number | null
          seed_quantity_kg?: number | null
          sowing_date: string
          stages_covered?: Json | null
          state_region?: string | null
          status?: string | null
          suitability_score?: number | null
          suitability_warnings?: Json | null
          taluka_name?: string | null
          tasks_completed_count?: number | null
          tasks_on_time_count?: number | null
          tasks_total_count?: number | null
          tenant_id: string
          total_duration_days?: number | null
          total_estimated_cost?: number | null
          total_labor_cost?: number | null
          total_material_cost?: number | null
          total_water_requirement_liters?: number | null
          training_batch_id?: string | null
          training_excluded_reason?: string | null
          training_processed?: boolean | null
          updated_at?: string | null
          vermicompost_kg?: number | null
          water_per_irrigation_liters?: number | null
          water_requirement_liters_total?: number | null
          weather_auto_update_enabled?: boolean | null
          weather_data?: Json | null
          yield_boosting_techniques?: Json | null
          yield_multiplier_target?: number | null
        }
        Update: {
          actual_harvest_date?: string | null
          actual_profit?: number | null
          actual_total_cost?: number | null
          actual_yield_quintals?: number | null
          agro_climatic_zone?: string | null
          ai_model?: string | null
          backdated_consent?: boolean | null
          backdated_consent_at?: string | null
          bio_fertilizer_units?: number | null
          bio_pesticide_ml?: number | null
          calculated_for_area_acres?: number | null
          completed_at?: string | null
          cost_by_category?: Json | null
          cost_by_stage?: Json | null
          country?: string | null
          created_at?: string | null
          crop_name?: string
          crop_variety?: string | null
          data_quality_score?: number | null
          district_name?: string | null
          expected_gross_revenue?: number | null
          expected_harvest_date?: string | null
          expected_market_price_per_quintal?: number | null
          expected_net_profit?: number | null
          expected_profit?: number | null
          expected_yield_per_acre?: number | null
          expected_yield_quintals?: number | null
          farmer_feedback?: string | null
          farmer_id?: string
          farmer_rating?: number | null
          farming_type?: string | null
          fertilizer_k_kg?: number | null
          fertilizer_n_kg?: number | null
          fertilizer_p_kg?: number | null
          fungicide_gm?: number | null
          generated_at?: string | null
          generation_language?: string | null
          generation_params?: Json | null
          growth_regulators?: Json | null
          herbicide_ml?: number | null
          id?: string
          input_land_coordinates?: Json | null
          input_soil_data?: Json | null
          input_weather_data?: Json | null
          insecticide_ml?: number | null
          intercrop_2_area_percent?: number | null
          intercrop_2_name?: string | null
          intercrop_2_sowing_date?: string | null
          intercrop_2_variety?: string | null
          intercrop_3_area_percent?: number | null
          intercrop_3_name?: string | null
          intercrop_3_sowing_date?: string | null
          intercrop_3_variety?: string | null
          intercrop_area_percent?: number | null
          intercrop_name?: string | null
          intercrop_sowing_date?: string | null
          intercrop_variety?: string | null
          irrigation_count_total?: number | null
          is_active?: boolean | null
          is_training_candidate?: boolean | null
          labor_rate_used?: number | null
          land_id?: string
          last_weather_check?: string | null
          last_weather_update?: string | null
          metadata?: Json | null
          organic_fertilizer_kg?: number | null
          organic_input_details?: Json | null
          organic_manure_kg?: number | null
          outcome_recorded_at?: string | null
          pesticide_requirements?: Json | null
          pgr_hormone_ml?: number | null
          products_recommended_count?: number | null
          recommendation_order?: string | null
          recommended_products?: Json | null
          regional_dialect_zone?: string | null
          schedule_accuracy_score?: number | null
          schedule_version?: number | null
          seed_quantity_kg?: number | null
          sowing_date?: string
          stages_covered?: Json | null
          state_region?: string | null
          status?: string | null
          suitability_score?: number | null
          suitability_warnings?: Json | null
          taluka_name?: string | null
          tasks_completed_count?: number | null
          tasks_on_time_count?: number | null
          tasks_total_count?: number | null
          tenant_id?: string
          total_duration_days?: number | null
          total_estimated_cost?: number | null
          total_labor_cost?: number | null
          total_material_cost?: number | null
          total_water_requirement_liters?: number | null
          training_batch_id?: string | null
          training_excluded_reason?: string | null
          training_processed?: boolean | null
          updated_at?: string | null
          vermicompost_kg?: number | null
          water_per_irrigation_liters?: number | null
          water_requirement_liters_total?: number | null
          weather_auto_update_enabled?: boolean | null
          weather_data?: Json | null
          yield_boosting_techniques?: Json | null
          yield_multiplier_target?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "crop_schedules_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_schedules_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "crop_schedules_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "crop_schedules_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "crop_schedules_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "crop_schedules_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      crop_templates: {
        Row: {
          best_practices: Json | null
          common_issues: Json | null
          created_at: string | null
          crop_name: string
          crop_variety: string | null
          id: string
          is_active: boolean | null
          lifecycle_days: number | null
          reference_url: string | null
          region: string | null
          schedule_template: Json
          season: string | null
          source: string | null
          updated_at: string | null
        }
        Insert: {
          best_practices?: Json | null
          common_issues?: Json | null
          created_at?: string | null
          crop_name: string
          crop_variety?: string | null
          id?: string
          is_active?: boolean | null
          lifecycle_days?: number | null
          reference_url?: string | null
          region?: string | null
          schedule_template: Json
          season?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Update: {
          best_practices?: Json | null
          common_issues?: Json | null
          created_at?: string | null
          crop_name?: string
          crop_variety?: string | null
          id?: string
          is_active?: boolean | null
          lifecycle_days?: number | null
          reference_url?: string | null
          region?: string | null
          schedule_template?: Json
          season?: string | null
          source?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      crops: {
        Row: {
          created_at: string | null
          crop_group_id: string | null
          description: string | null
          display_order: number
          duration_days: number | null
          icon: string
          id: string
          is_active: boolean | null
          is_popular: boolean | null
          label: string
          label_hi: string | null
          label_local: string | null
          label_mr: string | null
          local_name: string | null
          metadata: Json | null
          season: string | null
          updated_at: string
          value: string
        }
        Insert: {
          created_at?: string | null
          crop_group_id?: string | null
          description?: string | null
          display_order?: number
          duration_days?: number | null
          icon: string
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          label: string
          label_hi?: string | null
          label_local?: string | null
          label_mr?: string | null
          local_name?: string | null
          metadata?: Json | null
          season?: string | null
          updated_at?: string
          value: string
        }
        Update: {
          created_at?: string | null
          crop_group_id?: string | null
          description?: string | null
          display_order?: number
          duration_days?: number | null
          icon?: string
          id?: string
          is_active?: boolean | null
          is_popular?: boolean | null
          label?: string
          label_hi?: string | null
          label_local?: string | null
          label_mr?: string | null
          local_name?: string | null
          metadata?: Json | null
          season?: string | null
          updated_at?: string
          value?: string
        }
        Relationships: [
          {
            foreignKeyName: "crops_crop_group_id_fkey"
            columns: ["crop_group_id"]
            isOneToOne: false
            referencedRelation: "crop_groups"
            referencedColumns: ["id"]
          },
        ]
      }
      currency_rates: {
        Row: {
          base_currency: string
          created_at: string | null
          id: string
          rate: number
          source: string | null
          target_currency: string
          updated_at: string | null
          valid_from: string | null
          valid_until: string | null
        }
        Insert: {
          base_currency?: string
          created_at?: string | null
          id?: string
          rate: number
          source?: string | null
          target_currency: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Update: {
          base_currency?: string
          created_at?: string | null
          id?: string
          rate?: number
          source?: string | null
          target_currency?: string
          updated_at?: string | null
          valid_from?: string | null
          valid_until?: string | null
        }
        Relationships: []
      }
      custom_reports: {
        Row: {
          created_at: string
          created_by: string | null
          description: string | null
          filters: Json | null
          id: string
          is_public: boolean | null
          is_scheduled: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          query_config: Json
          report_name: string
          report_type: string
          schedule_config: Json | null
          tenant_id: string
          updated_at: string
          visualization_config: Json
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          is_public?: boolean | null
          is_scheduled?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          query_config?: Json
          report_name: string
          report_type: string
          schedule_config?: Json | null
          tenant_id: string
          updated_at?: string
          visualization_config?: Json
        }
        Update: {
          created_at?: string
          created_by?: string | null
          description?: string | null
          filters?: Json | null
          id?: string
          is_public?: boolean | null
          is_scheduled?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          query_config?: Json
          report_name?: string
          report_type?: string
          schedule_config?: Json | null
          tenant_id?: string
          updated_at?: string
          visualization_config?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fk_custom_reports_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_configs: {
        Row: {
          created_at: string | null
          dashboard_name: string
          id: string
          is_default: boolean | null
          is_public: boolean | null
          layout: Json
          updated_at: string | null
          user_id: string
          widgets: Json
        }
        Insert: {
          created_at?: string | null
          dashboard_name: string
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          layout: Json
          updated_at?: string | null
          user_id: string
          widgets?: Json
        }
        Update: {
          created_at?: string | null
          dashboard_name?: string
          id?: string
          is_default?: boolean | null
          is_public?: boolean | null
          layout?: Json
          updated_at?: string | null
          user_id?: string
          widgets?: Json
        }
        Relationships: []
      }
      dashboard_updates: {
        Row: {
          created_at: string | null
          created_by: string | null
          data: Json
          entity_id: string
          entity_type: string
          expires_at: string | null
          id: string
          organization_id: string
          update_type: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          data: Json
          entity_id: string
          entity_type: string
          expires_at?: string | null
          id?: string
          organization_id: string
          update_type: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          data?: Json
          entity_id?: string
          entity_type?: string
          expires_at?: string | null
          id?: string
          organization_id?: string
          update_type?: string
        }
        Relationships: []
      }
      data_export_logs: {
        Row: {
          created_at: string
          data_source: string
          download_count: number | null
          expires_at: string | null
          export_format: string
          export_type: string
          exported_by: string
          file_size_bytes: number | null
          file_url: string | null
          filters_applied: Json | null
          id: string
          row_count: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data_source: string
          download_count?: number | null
          expires_at?: string | null
          export_format: string
          export_type: string
          exported_by: string
          file_size_bytes?: number | null
          file_url?: string | null
          filters_applied?: Json | null
          id?: string
          row_count?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data_source?: string
          download_count?: number | null
          expires_at?: string | null
          export_format?: string
          export_type?: string
          exported_by?: string
          file_size_bytes?: number | null
          file_url?: string | null
          filters_applied?: Json | null
          id?: string
          row_count?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_data_export_logs_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_migration_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_log: Json | null
          failed_records: number | null
          id: string
          mapping_config: Json | null
          migration_type: string
          processed_records: number | null
          progress_data: Json | null
          source_config: Json | null
          started_at: string | null
          status: string | null
          tenant_id: string | null
          total_records: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: Json | null
          failed_records?: number | null
          id?: string
          mapping_config?: Json | null
          migration_type: string
          processed_records?: number | null
          progress_data?: Json | null
          source_config?: Json | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_records?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: Json | null
          failed_records?: number | null
          id?: string
          mapping_config?: Json | null
          migration_type?: string
          processed_records?: number | null
          progress_data?: Json | null
          source_config?: Json | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_records?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_migration_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_privacy_settings: {
        Row: {
          anonymization_settings: Json | null
          backup_settings: Json | null
          created_at: string | null
          data_retention_policy: Json | null
          encryption_settings: Json | null
          gdpr_settings: Json | null
          id: string
          tenant_id: string
          third_party_sharing: Json | null
          updated_at: string | null
        }
        Insert: {
          anonymization_settings?: Json | null
          backup_settings?: Json | null
          created_at?: string | null
          data_retention_policy?: Json | null
          encryption_settings?: Json | null
          gdpr_settings?: Json | null
          id?: string
          tenant_id: string
          third_party_sharing?: Json | null
          updated_at?: string | null
        }
        Update: {
          anonymization_settings?: Json | null
          backup_settings?: Json | null
          created_at?: string | null
          data_retention_policy?: Json | null
          encryption_settings?: Json | null
          gdpr_settings?: Json | null
          id?: string
          tenant_id?: string
          third_party_sharing?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "data_privacy_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      data_retention_config: {
        Row: {
          archive_before_delete: boolean | null
          created_at: string | null
          date_column: string
          id: string
          is_active: boolean | null
          retention_days: number
          soft_delete: boolean | null
          table_name: string
          updated_at: string | null
        }
        Insert: {
          archive_before_delete?: boolean | null
          created_at?: string | null
          date_column?: string
          id?: string
          is_active?: boolean | null
          retention_days: number
          soft_delete?: boolean | null
          table_name: string
          updated_at?: string | null
        }
        Update: {
          archive_before_delete?: boolean | null
          created_at?: string | null
          date_column?: string
          id?: string
          is_active?: boolean | null
          retention_days?: number
          soft_delete?: boolean | null
          table_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      data_transformations: {
        Row: {
          created_at: string
          id: string
          is_active: boolean
          name: string
          source_format: string
          target_format: string
          tenant_id: string
          transformation_rules: Json
          updated_at: string
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string
          id?: string
          is_active?: boolean
          name: string
          source_format: string
          target_format: string
          tenant_id: string
          transformation_rules: Json
          updated_at?: string
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          source_format?: string
          target_format?: string
          tenant_id?: string
          transformation_rules?: Json
          updated_at?: string
          validation_rules?: Json | null
        }
        Relationships: []
      }
      dealer_commissions: {
        Row: {
          base_amount: number
          commission_amount: number
          commission_rate: number
          commission_status: string
          created_at: string
          dealer_id: string
          id: string
          order_id: string
          payment_date: string | null
          payment_reference: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          base_amount: number
          commission_amount: number
          commission_rate: number
          commission_status?: string
          created_at?: string
          dealer_id: string
          id?: string
          order_id: string
          payment_date?: string | null
          payment_reference?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          base_amount?: number
          commission_amount?: number
          commission_rate?: number
          commission_status?: string
          created_at?: string
          dealer_id?: string
          id?: string
          order_id?: string
          payment_date?: string | null
          payment_reference?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_commissions_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_commissions_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_commissions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_communications: {
        Row: {
          attachments: Json | null
          communication_type: string
          content: string | null
          created_at: string
          delivery_status: Json | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          priority: string | null
          read_receipts: Json | null
          recipient_ids: string[]
          scheduled_at: string | null
          sender_id: string
          sent_at: string | null
          tenant_id: string
          title: string
          updated_at: string
        }
        Insert: {
          attachments?: Json | null
          communication_type: string
          content?: string | null
          created_at?: string
          delivery_status?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          priority?: string | null
          read_receipts?: Json | null
          recipient_ids: string[]
          scheduled_at?: string | null
          sender_id: string
          sent_at?: string | null
          tenant_id: string
          title: string
          updated_at?: string
        }
        Update: {
          attachments?: Json | null
          communication_type?: string
          content?: string | null
          created_at?: string
          delivery_status?: Json | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          priority?: string | null
          read_receipts?: Json | null
          recipient_ids?: string[]
          scheduled_at?: string | null
          sender_id?: string
          sent_at?: string | null
          tenant_id?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      dealer_documents: {
        Row: {
          created_at: string
          dealer_id: string
          document_name: string
          document_type: string
          expiry_date: string | null
          file_url: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          rejection_reason: string | null
          tenant_id: string
          updated_at: string
          verification_status: string | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          dealer_id: string
          document_name: string
          document_type: string
          expiry_date?: string | null
          file_url: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          rejection_reason?: string | null
          tenant_id: string
          updated_at?: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          dealer_id?: string
          document_name?: string
          document_type?: string
          expiry_date?: string | null
          file_url?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          rejection_reason?: string | null
          tenant_id?: string
          updated_at?: string
          verification_status?: string | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: []
      }
      dealer_performance: {
        Row: {
          achievements: Json | null
          average_response_time_hours: number | null
          bonus_earned: number | null
          commission_earned: number | null
          created_at: string
          customer_satisfaction_score: number | null
          dealer_id: string
          farmers_acquired: number | null
          farmers_target: number | null
          id: string
          orders_processed: number | null
          performance_score: number | null
          period_end: string
          period_start: string
          ranking: number | null
          sales_achieved: number | null
          sales_target: number | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          achievements?: Json | null
          average_response_time_hours?: number | null
          bonus_earned?: number | null
          commission_earned?: number | null
          created_at?: string
          customer_satisfaction_score?: number | null
          dealer_id: string
          farmers_acquired?: number | null
          farmers_target?: number | null
          id?: string
          orders_processed?: number | null
          performance_score?: number | null
          period_end: string
          period_start: string
          ranking?: number | null
          sales_achieved?: number | null
          sales_target?: number | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          achievements?: Json | null
          average_response_time_hours?: number | null
          bonus_earned?: number | null
          commission_earned?: number | null
          created_at?: string
          customer_satisfaction_score?: number | null
          dealer_id?: string
          farmers_acquired?: number | null
          farmers_target?: number | null
          id?: string
          orders_processed?: number | null
          performance_score?: number | null
          period_end?: string
          period_start?: string
          ranking?: number | null
          sales_achieved?: number | null
          sales_target?: number | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      dealer_territories: {
        Row: {
          assigned_dealer_id: string | null
          assignment_date: string | null
          coverage_status: string | null
          created_at: string
          description: string | null
          geographic_bounds: Json | null
          id: string
          is_active: boolean | null
          market_potential: Json | null
          performance_metrics: Json | null
          population_data: Json | null
          tenant_id: string
          territory_code: string
          territory_name: string
          updated_at: string
        }
        Insert: {
          assigned_dealer_id?: string | null
          assignment_date?: string | null
          coverage_status?: string | null
          created_at?: string
          description?: string | null
          geographic_bounds?: Json | null
          id?: string
          is_active?: boolean | null
          market_potential?: Json | null
          performance_metrics?: Json | null
          population_data?: Json | null
          tenant_id: string
          territory_code: string
          territory_name: string
          updated_at?: string
        }
        Update: {
          assigned_dealer_id?: string | null
          assignment_date?: string | null
          coverage_status?: string | null
          created_at?: string
          description?: string | null
          geographic_bounds?: Json | null
          id?: string
          is_active?: boolean | null
          market_potential?: Json | null
          performance_metrics?: Json | null
          population_data?: Json | null
          tenant_id?: string
          territory_code?: string
          territory_name?: string
          updated_at?: string
        }
        Relationships: []
      }
      dealers: {
        Row: {
          agreement_signed_at: string | null
          agreement_url: string | null
          bank_details: Json | null
          business_address: Json | null
          business_name: string
          business_type: string | null
          commission_rate: number | null
          contact_person: string
          created_at: string
          credit_limit: number | null
          dealer_code: string
          dealer_name: string | null
          email: string
          gst_number: string | null
          id: string
          is_active: boolean | null
          kyc_status: string | null
          metadata: Json | null
          onboarding_date: string | null
          pan_number: string | null
          payment_terms: string | null
          performance_rating: number | null
          phone: string
          product_authorizations: Json | null
          registration_status: string | null
          tenant_id: string
          territory_ids: string[] | null
          updated_at: string
          verification_status: string | null
        }
        Insert: {
          agreement_signed_at?: string | null
          agreement_url?: string | null
          bank_details?: Json | null
          business_address?: Json | null
          business_name: string
          business_type?: string | null
          commission_rate?: number | null
          contact_person: string
          created_at?: string
          credit_limit?: number | null
          dealer_code: string
          dealer_name?: string | null
          email: string
          gst_number?: string | null
          id?: string
          is_active?: boolean | null
          kyc_status?: string | null
          metadata?: Json | null
          onboarding_date?: string | null
          pan_number?: string | null
          payment_terms?: string | null
          performance_rating?: number | null
          phone: string
          product_authorizations?: Json | null
          registration_status?: string | null
          tenant_id: string
          territory_ids?: string[] | null
          updated_at?: string
          verification_status?: string | null
        }
        Update: {
          agreement_signed_at?: string | null
          agreement_url?: string | null
          bank_details?: Json | null
          business_address?: Json | null
          business_name?: string
          business_type?: string | null
          commission_rate?: number | null
          contact_person?: string
          created_at?: string
          credit_limit?: number | null
          dealer_code?: string
          dealer_name?: string | null
          email?: string
          gst_number?: string | null
          id?: string
          is_active?: boolean | null
          kyc_status?: string | null
          metadata?: Json | null
          onboarding_date?: string | null
          pan_number?: string | null
          payment_terms?: string | null
          performance_rating?: number | null
          phone?: string
          product_authorizations?: Json | null
          registration_status?: string | null
          tenant_id?: string
          territory_ids?: string[] | null
          updated_at?: string
          verification_status?: string | null
        }
        Relationships: []
      }
      decision_rules: {
        Row: {
          category: string
          cause: string
          conditions_json: Json
          created_at: string | null
          crop_code: string | null
          crop_group: string
          icar_package: string | null
          id: string
          is_active: boolean | null
          priority: number
          rule_id: string
          scientific_source: string | null
          stage_applicable: string[]
          updated_at: string | null
          version: string | null
        }
        Insert: {
          category: string
          cause: string
          conditions_json: Json
          created_at?: string | null
          crop_code?: string | null
          crop_group: string
          icar_package?: string | null
          id?: string
          is_active?: boolean | null
          priority: number
          rule_id: string
          scientific_source?: string | null
          stage_applicable: string[]
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          category?: string
          cause?: string
          conditions_json?: Json
          created_at?: string | null
          crop_code?: string | null
          crop_group?: string
          icar_package?: string | null
          id?: string
          is_active?: boolean | null
          priority?: number
          rule_id?: string
          scientific_source?: string | null
          stage_applicable?: string[]
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      direct_messages: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_read: boolean | null
          media_url: string | null
          original_language: string | null
          read_at: string | null
          receiver_id: string
          sender_id: string
          translations: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          original_language?: string | null
          read_at?: string | null
          receiver_id: string
          sender_id: string
          translations?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          media_url?: string | null
          original_language?: string | null
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
          translations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "direct_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "direct_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      district_zone_mapping: {
        Row: {
          created_at: string | null
          district_id: string
          id: string
          is_active: boolean | null
          zone_id: string
        }
        Insert: {
          created_at?: string | null
          district_id: string
          id?: string
          is_active?: boolean | null
          zone_id: string
        }
        Update: {
          created_at?: string | null
          district_id?: string
          id?: string
          is_active?: boolean | null
          zone_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "district_zone_mapping_zone_id_fkey"
            columns: ["zone_id"]
            isOneToOne: false
            referencedRelation: "agro_climatic_zones"
            referencedColumns: ["id"]
          },
        ]
      }
      districts: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          state_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          state_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          state_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "districts_state_id_fkey"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      domain_mappings: {
        Row: {
          created_at: string | null
          domain: string
          id: string
          is_active: boolean | null
          is_verified: boolean | null
          portal_mappings: Json | null
          ssl_status: string | null
          tenant_id: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          created_at?: string | null
          domain: string
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          portal_mappings?: Json | null
          ssl_status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          created_at?: string | null
          domain?: string
          id?: string
          is_active?: boolean | null
          is_verified?: boolean | null
          portal_mappings?: Json | null
          ssl_status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "domain_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      edge_invocation_logs: {
        Row: {
          function_name: string
          id: number
          invoked_at: string | null
          payload: Json | null
          user_id: string | null
        }
        Insert: {
          function_name: string
          id?: never
          invoked_at?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Update: {
          function_name?: string
          id?: never
          invoked_at?: string | null
          payload?: Json | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_events: {
        Row: {
          created_at: string | null
          email_address: string
          error_message: string | null
          event_type: string
          id: string
          metadata: Json | null
          sent_at: string | null
          status: string
          template_type: string
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          email_address: string
          error_message?: string | null
          event_type: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string
          template_type: string
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          email_address?: string
          error_message?: string | null
          event_type?: string
          id?: string
          metadata?: Json | null
          sent_at?: string | null
          status?: string
          template_type?: string
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      email_logs: {
        Row: {
          bounced_at: string | null
          clicked_at: string | null
          correlation_id: string | null
          created_at: string | null
          delivered_at: string | null
          delivery_attempts: number | null
          error_message: string | null
          external_message_id: string | null
          failed_at: string | null
          id: string
          last_attempt_at: string | null
          metadata: Json | null
          opened_at: string | null
          priority: string | null
          provider_response: Json | null
          recipient_email: string
          recipient_id: string | null
          retry_count: number | null
          sent_at: string | null
          status: string
          subject: string
          template_id: string | null
          template_type: string
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          bounced_at?: string | null
          clicked_at?: string | null
          correlation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_attempts?: number | null
          error_message?: string | null
          external_message_id?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          metadata?: Json | null
          opened_at?: string | null
          priority?: string | null
          provider_response?: Json | null
          recipient_email: string
          recipient_id?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          subject: string
          template_id?: string | null
          template_type: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bounced_at?: string | null
          clicked_at?: string | null
          correlation_id?: string | null
          created_at?: string | null
          delivered_at?: string | null
          delivery_attempts?: number | null
          error_message?: string | null
          external_message_id?: string | null
          failed_at?: string | null
          id?: string
          last_attempt_at?: string | null
          metadata?: Json | null
          opened_at?: string | null
          priority?: string | null
          provider_response?: Json | null
          recipient_email?: string
          recipient_id?: string | null
          retry_count?: number | null
          sent_at?: string | null
          status?: string
          subject?: string
          template_id?: string | null
          template_type?: string
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_logs_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_template_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          name: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          name?: string
          sort_order?: number | null
        }
        Relationships: []
      }
      email_templates: {
        Row: {
          category: string | null
          created_at: string | null
          created_by: string | null
          html_template: string
          id: string
          is_active: boolean | null
          is_default: boolean | null
          parent_template_id: string | null
          preview_text: string | null
          subject_template: string
          template_name: string
          template_type: string
          tenant_id: string | null
          text_template: string | null
          updated_at: string | null
          variables: string[] | null
          version: number | null
        }
        Insert: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          html_template: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          parent_template_id?: string | null
          preview_text?: string | null
          subject_template: string
          template_name: string
          template_type: string
          tenant_id?: string | null
          text_template?: string | null
          updated_at?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Update: {
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          html_template?: string
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          parent_template_id?: string | null
          preview_text?: string | null
          subject_template?: string
          template_name?: string
          template_type?: string
          tenant_id?: string | null
          text_template?: string | null
          updated_at?: string | null
          variables?: string[] | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "email_templates_parent_template_id_fkey"
            columns: ["parent_template_id"]
            isOneToOne: false
            referencedRelation: "email_templates"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "email_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      email_verifications: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          is_verified: boolean | null
          metadata: Json | null
          tenant_id: string | null
          user_id: string
          verification_token: string
          verification_type: string
          verified_at: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string
          id?: string
          is_verified?: boolean | null
          metadata?: Json | null
          tenant_id?: string | null
          user_id: string
          verification_token: string
          verification_type?: string
          verified_at?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_verified?: boolean | null
          metadata?: Json | null
          tenant_id?: string | null
          user_id?: string
          verification_token?: string
          verification_type?: string
          verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "email_verifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      executive_dashboard_metrics: {
        Row: {
          created_at: string
          dimensions: Json | null
          id: string
          metadata: Json | null
          metric_name: string
          metric_type: string
          metric_value: number
          recorded_date: string
          tenant_id: string
          time_period: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          dimensions?: Json | null
          id?: string
          metadata?: Json | null
          metric_name: string
          metric_type: string
          metric_value: number
          recorded_date: string
          tenant_id: string
          time_period: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          dimensions?: Json | null
          id?: string
          metadata?: Json | null
          metric_name?: string
          metric_type?: string
          metric_value?: number
          recorded_date?: string
          tenant_id?: string
          time_period?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_executive_metrics_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      expert_escalations: {
        Row: {
          context_data: Json | null
          created_at: string | null
          decision_id: string | null
          escalation_level: string | null
          escalation_reasons: string[] | null
          expert_assigned: string | null
          expert_response: string | null
          expert_type: string | null
          farmer_id: string | null
          farmer_notified: boolean | null
          id: string
          resolved_at: string | null
          response_time_minutes: number | null
          session_id: string | null
          status: string | null
          tenant_id: string | null
          updated_at: string | null
          urgency: string | null
        }
        Insert: {
          context_data?: Json | null
          created_at?: string | null
          decision_id?: string | null
          escalation_level?: string | null
          escalation_reasons?: string[] | null
          expert_assigned?: string | null
          expert_response?: string | null
          expert_type?: string | null
          farmer_id?: string | null
          farmer_notified?: boolean | null
          id?: string
          resolved_at?: string | null
          response_time_minutes?: number | null
          session_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Update: {
          context_data?: Json | null
          created_at?: string | null
          decision_id?: string | null
          escalation_level?: string | null
          escalation_reasons?: string[] | null
          expert_assigned?: string | null
          expert_response?: string | null
          expert_type?: string | null
          farmer_id?: string | null
          farmer_notified?: boolean | null
          id?: string
          resolved_at?: string | null
          response_time_minutes?: number | null
          session_id?: string | null
          status?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          urgency?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "expert_escalations_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expert_escalations_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "expert_escalations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_achievements: {
        Row: {
          achievement_id: string
          earned_at: string | null
          farmer_id: string
          id: string
        }
        Insert: {
          achievement_id: string
          earned_at?: string | null
          farmer_id: string
          id?: string
        }
        Update: {
          achievement_id?: string
          earned_at?: string | null
          farmer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_achievements_achievement_id_fkey"
            columns: ["achievement_id"]
            isOneToOne: false
            referencedRelation: "achievements"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_achievements_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_achievements_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      farmer_alerts: {
        Row: {
          action_required: string | null
          actioned_at: string | null
          ai_reasoning: string | null
          alert_type: string
          created_at: string | null
          data_source: Json | null
          expires_at: string | null
          farmer_id: string
          id: string
          is_actioned: boolean | null
          is_read: boolean | null
          land_id: string
          message: string
          priority: string
          schedule_id: string | null
          tenant_id: string
          title: string
        }
        Insert: {
          action_required?: string | null
          actioned_at?: string | null
          ai_reasoning?: string | null
          alert_type: string
          created_at?: string | null
          data_source?: Json | null
          expires_at?: string | null
          farmer_id: string
          id?: string
          is_actioned?: boolean | null
          is_read?: boolean | null
          land_id: string
          message: string
          priority: string
          schedule_id?: string | null
          tenant_id: string
          title: string
        }
        Update: {
          action_required?: string | null
          actioned_at?: string | null
          ai_reasoning?: string | null
          alert_type?: string
          created_at?: string | null
          data_source?: Json | null
          expires_at?: string | null
          farmer_id?: string
          id?: string
          is_actioned?: boolean | null
          is_read?: boolean | null
          land_id?: string
          message?: string
          priority?: string
          schedule_id?: string | null
          tenant_id?: string
          title?: string
        }
        Relationships: []
      }
      farmer_analytics: {
        Row: {
          adoption_score: number | null
          app_usage_days: number | null
          calculated_at: string
          churn_risk_score: number | null
          created_at: string
          engagement_score: number | null
          farmer_id: string
          features_used: Json | null
          id: string
          last_activity_date: string | null
          lifetime_value: number | null
          performance_metrics: Json | null
          predicted_metrics: Json | null
          segment: string | null
          tenant_id: string
          total_spent: number | null
          total_transactions: number | null
          updated_at: string
        }
        Insert: {
          adoption_score?: number | null
          app_usage_days?: number | null
          calculated_at?: string
          churn_risk_score?: number | null
          created_at?: string
          engagement_score?: number | null
          farmer_id: string
          features_used?: Json | null
          id?: string
          last_activity_date?: string | null
          lifetime_value?: number | null
          performance_metrics?: Json | null
          predicted_metrics?: Json | null
          segment?: string | null
          tenant_id: string
          total_spent?: number | null
          total_transactions?: number | null
          updated_at?: string
        }
        Update: {
          adoption_score?: number | null
          app_usage_days?: number | null
          calculated_at?: string
          churn_risk_score?: number | null
          created_at?: string
          engagement_score?: number | null
          farmer_id?: string
          features_used?: Json | null
          id?: string
          last_activity_date?: string | null
          lifetime_value?: number | null
          performance_metrics?: Json | null
          predicted_metrics?: Json | null
          segment?: string | null
          tenant_id?: string
          total_spent?: number | null
          total_transactions?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_farmer_analytics_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_communications: {
        Row: {
          communication_type: string
          created_by: string | null
          delivered_at: string | null
          farmer_id: string
          id: string
          message_content: string | null
          metadata: Json | null
          read_at: string | null
          response_at: string | null
          sent_at: string | null
          status: string | null
          tenant_id: string
        }
        Insert: {
          communication_type: string
          created_by?: string | null
          delivered_at?: string | null
          farmer_id: string
          id?: string
          message_content?: string | null
          metadata?: Json | null
          read_at?: string | null
          response_at?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id: string
        }
        Update: {
          communication_type?: string
          created_by?: string | null
          delivered_at?: string | null
          farmer_id?: string
          id?: string
          message_content?: string | null
          metadata?: Json | null
          read_at?: string | null
          response_at?: string | null
          sent_at?: string | null
          status?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_communications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_communications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_communications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_consent_log: {
        Row: {
          consent_given: boolean
          consent_type: string
          consent_version: string
          created_at: string | null
          farmer_id: string
          id: string
          ip_address: unknown
          metadata: Json | null
          tenant_id: string
          user_agent: string | null
        }
        Insert: {
          consent_given: boolean
          consent_type: string
          consent_version?: string
          created_at?: string | null
          farmer_id: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          tenant_id: string
          user_agent?: string | null
        }
        Update: {
          consent_given?: boolean
          consent_type?: string
          consent_version?: string
          created_at?: string | null
          farmer_id?: string
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          tenant_id?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_consent_log_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_consent_log_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_consent_log_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_engagement: {
        Row: {
          activity_score: number | null
          app_opens_count: number | null
          churn_risk_score: number | null
          communication_responses: number | null
          created_at: string | null
          engagement_level: string | null
          farmer_id: string
          features_used: string[] | null
          id: string
          last_app_open: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activity_score?: number | null
          app_opens_count?: number | null
          churn_risk_score?: number | null
          communication_responses?: number | null
          created_at?: string | null
          engagement_level?: string | null
          farmer_id: string
          features_used?: string[] | null
          id?: string
          last_app_open?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activity_score?: number | null
          app_opens_count?: number | null
          churn_risk_score?: number | null
          communication_responses?: number | null
          created_at?: string | null
          engagement_level?: string | null
          farmer_id?: string
          features_used?: string[] | null
          id?: string
          last_app_open?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_engagement_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_engagement_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_engagement_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_follows: {
        Row: {
          created_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          created_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          created_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_follows_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_follows_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      farmer_gamification: {
        Row: {
          comments_count: number | null
          created_at: string | null
          crop_rank: number | null
          current_level: number | null
          farmer_id: string
          helpful_answers: number | null
          id: string
          last_activity_at: string | null
          likes_given: number | null
          likes_received: number | null
          monthly_points: number | null
          posts_count: number | null
          state_rank: number | null
          total_points: number | null
          updated_at: string | null
          weekly_points: number | null
        }
        Insert: {
          comments_count?: number | null
          created_at?: string | null
          crop_rank?: number | null
          current_level?: number | null
          farmer_id: string
          helpful_answers?: number | null
          id?: string
          last_activity_at?: string | null
          likes_given?: number | null
          likes_received?: number | null
          monthly_points?: number | null
          posts_count?: number | null
          state_rank?: number | null
          total_points?: number | null
          updated_at?: string | null
          weekly_points?: number | null
        }
        Update: {
          comments_count?: number | null
          created_at?: string | null
          crop_rank?: number | null
          current_level?: number | null
          farmer_id?: string
          helpful_answers?: number | null
          id?: string
          last_activity_at?: string | null
          likes_given?: number | null
          likes_received?: number | null
          monthly_points?: number | null
          posts_count?: number | null
          state_rank?: number | null
          total_points?: number | null
          updated_at?: string | null
          weekly_points?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_gamification_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: true
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_gamification_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: true
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      farmer_import_logs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_log: Json | null
          failed_records: number | null
          file_name: string
          file_size: number | null
          id: string
          imported_by: string | null
          status: string | null
          successful_records: number | null
          tenant_id: string
          total_records: number | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: Json | null
          failed_records?: number | null
          file_name: string
          file_size?: number | null
          id?: string
          imported_by?: string | null
          status?: string | null
          successful_records?: number | null
          tenant_id: string
          total_records?: number | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: Json | null
          failed_records?: number | null
          file_name?: string
          file_size?: number | null
          id?: string
          imported_by?: string | null
          status?: string | null
          successful_records?: number | null
          tenant_id?: string
          total_records?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_import_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_leads: {
        Row: {
          assigned_at: string | null
          assigned_to: string | null
          contact_name: string
          converted_at: string | null
          converted_farmer_id: string | null
          created_at: string | null
          crops_interested: string[] | null
          email: string | null
          id: string
          land_size: number | null
          lead_score: number | null
          lead_source: string
          location: Json | null
          metadata: Json | null
          next_follow_up: string | null
          notes: string | null
          phone: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_to?: string | null
          contact_name: string
          converted_at?: string | null
          converted_farmer_id?: string | null
          created_at?: string | null
          crops_interested?: string[] | null
          email?: string | null
          id?: string
          land_size?: number | null
          lead_score?: number | null
          lead_source: string
          location?: Json | null
          metadata?: Json | null
          next_follow_up?: string | null
          notes?: string | null
          phone?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          assigned_at?: string | null
          assigned_to?: string | null
          contact_name?: string
          converted_at?: string | null
          converted_farmer_id?: string | null
          created_at?: string | null
          crops_interested?: string[] | null
          email?: string | null
          id?: string
          land_size?: number | null
          lead_score?: number | null
          lead_source?: string
          location?: Json | null
          metadata?: Json | null
          next_follow_up?: string | null
          notes?: string | null
          phone?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_leads_converted_farmer_id_fkey"
            columns: ["converted_farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_leads_converted_farmer_id_fkey"
            columns: ["converted_farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_leads_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_notes: {
        Row: {
          created_at: string | null
          created_by: string | null
          farmer_id: string
          id: string
          is_important: boolean | null
          is_private: boolean | null
          note_content: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          farmer_id: string
          id?: string
          is_important?: boolean | null
          is_private?: boolean | null
          note_content: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          farmer_id?: string
          id?: string
          is_important?: boolean | null
          is_private?: boolean | null
          note_content?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_notes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_notes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_notes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_segments: {
        Row: {
          color: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean | null
          segment_criteria: Json
          segment_name: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          segment_criteria?: Json
          segment_name: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          color?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          segment_criteria?: Json
          segment_name?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmer_segments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_subscriptions: {
        Row: {
          auto_renew: boolean
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancellation_reason: string | null
          created_at: string
          end_date: string | null
          farmer_id: string
          grace_period_ends_at: string | null
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          metadata: Json | null
          next_billing_date: string | null
          paid_by_tenant: boolean | null
          paying_tenant_id: string | null
          payment_method: Json | null
          payment_method_id: string | null
          plan_id: string
          start_date: string
          status: string
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string
          tenant_subscription_id: string | null
          trial_days: number | null
          trial_end_date: string | null
          updated_at: string
        }
        Insert: {
          auto_renew?: boolean
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancellation_reason?: string | null
          created_at?: string
          end_date?: string | null
          farmer_id: string
          grace_period_ends_at?: string | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          next_billing_date?: string | null
          paid_by_tenant?: boolean | null
          paying_tenant_id?: string | null
          payment_method?: Json | null
          payment_method_id?: string | null
          plan_id: string
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id: string
          tenant_subscription_id?: string | null
          trial_days?: number | null
          trial_end_date?: string | null
          updated_at?: string
        }
        Update: {
          auto_renew?: boolean
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancellation_reason?: string | null
          created_at?: string
          end_date?: string | null
          farmer_id?: string
          grace_period_ends_at?: string | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          next_billing_date?: string | null
          paid_by_tenant?: boolean | null
          paying_tenant_id?: string | null
          payment_method?: Json | null
          payment_method_id?: string | null
          plan_id?: string
          start_date?: string
          status?: string
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string
          tenant_subscription_id?: string | null
          trial_days?: number | null
          trial_end_date?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: true
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: true
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_subscriptions_paying_tenant_id_fkey"
            columns: ["paying_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_subscriptions_tenant_subscription_id_fkey"
            columns: ["tenant_subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_tags: {
        Row: {
          created_at: string | null
          created_by: string | null
          farmer_id: string
          id: string
          tag_color: string | null
          tag_name: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          farmer_id: string
          id?: string
          tag_color?: string | null
          tag_name: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          farmer_id?: string
          id?: string
          tag_color?: string | null
          tag_name?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "farmer_tags_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmer_tags_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "farmer_tags_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmers: {
        Row: {
          aadhaar_number: string | null
          annual_income_range: string | null
          app_install_date: string | null
          archived: boolean | null
          associated_tenants: string[] | null
          created_at: string | null
          current_subscription_id: string | null
          failed_login_attempts: number | null
          farm_type: string | null
          farmer_code: string | null
          farmer_name: string | null
          farming_experience_years: number | null
          has_irrigation: boolean | null
          has_loan: boolean | null
          has_storage: boolean | null
          has_tractor: boolean | null
          id: string
          irrigation_type: string | null
          is_active: boolean | null
          is_verified: boolean | null
          language_preference: string | null
          last_app_open: string | null
          last_failed_login: string | null
          last_login_at: string | null
          loan_amount: number | null
          location: string | null
          login_attempts: number | null
          metadata: Json | null
          mobile_number: string | null
          notes: string | null
          pin: string | null
          pin_hash: string | null
          pin_updated_at: string | null
          preferred_contact_method: string | null
          preferred_dealer_id: string | null
          primary_crops: string[] | null
          seller_profile: Json | null
          seller_rating: number | null
          seller_verified: boolean | null
          shc_id: string | null
          store_description: string | null
          store_name: string | null
          subscription_expires_at: string | null
          subscription_status: string | null
          tenant_id: string | null
          total_app_opens: number | null
          total_land_acres: number | null
          total_queries: number | null
          total_sales: number | null
          updated_at: string | null
          user_profile_id: string | null
          verification_documents: Json | null
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          aadhaar_number?: string | null
          annual_income_range?: string | null
          app_install_date?: string | null
          archived?: boolean | null
          associated_tenants?: string[] | null
          created_at?: string | null
          current_subscription_id?: string | null
          failed_login_attempts?: number | null
          farm_type?: string | null
          farmer_code?: string | null
          farmer_name?: string | null
          farming_experience_years?: number | null
          has_irrigation?: boolean | null
          has_loan?: boolean | null
          has_storage?: boolean | null
          has_tractor?: boolean | null
          id?: string
          irrigation_type?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          language_preference?: string | null
          last_app_open?: string | null
          last_failed_login?: string | null
          last_login_at?: string | null
          loan_amount?: number | null
          location?: string | null
          login_attempts?: number | null
          metadata?: Json | null
          mobile_number?: string | null
          notes?: string | null
          pin?: string | null
          pin_hash?: string | null
          pin_updated_at?: string | null
          preferred_contact_method?: string | null
          preferred_dealer_id?: string | null
          primary_crops?: string[] | null
          seller_profile?: Json | null
          seller_rating?: number | null
          seller_verified?: boolean | null
          shc_id?: string | null
          store_description?: string | null
          store_name?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          tenant_id?: string | null
          total_app_opens?: number | null
          total_land_acres?: number | null
          total_queries?: number | null
          total_sales?: number | null
          updated_at?: string | null
          user_profile_id?: string | null
          verification_documents?: Json | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          aadhaar_number?: string | null
          annual_income_range?: string | null
          app_install_date?: string | null
          archived?: boolean | null
          associated_tenants?: string[] | null
          created_at?: string | null
          current_subscription_id?: string | null
          failed_login_attempts?: number | null
          farm_type?: string | null
          farmer_code?: string | null
          farmer_name?: string | null
          farming_experience_years?: number | null
          has_irrigation?: boolean | null
          has_loan?: boolean | null
          has_storage?: boolean | null
          has_tractor?: boolean | null
          id?: string
          irrigation_type?: string | null
          is_active?: boolean | null
          is_verified?: boolean | null
          language_preference?: string | null
          last_app_open?: string | null
          last_failed_login?: string | null
          last_login_at?: string | null
          loan_amount?: number | null
          location?: string | null
          login_attempts?: number | null
          metadata?: Json | null
          mobile_number?: string | null
          notes?: string | null
          pin?: string | null
          pin_hash?: string | null
          pin_updated_at?: string | null
          preferred_contact_method?: string | null
          preferred_dealer_id?: string | null
          primary_crops?: string[] | null
          seller_profile?: Json | null
          seller_rating?: number | null
          seller_verified?: boolean | null
          shc_id?: string | null
          store_description?: string | null
          store_name?: string | null
          subscription_expires_at?: string | null
          subscription_status?: string | null
          tenant_id?: string | null
          total_app_opens?: number | null
          total_land_acres?: number | null
          total_queries?: number | null
          total_sales?: number | null
          updated_at?: string | null
          user_profile_id?: string | null
          verification_documents?: Json | null
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "farmers_current_subscription_id_fkey"
            columns: ["current_subscription_id"]
            isOneToOne: false
            referencedRelation: "active_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmers_current_subscription_id_fkey"
            columns: ["current_subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmers_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "farmers_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["user_profile_id"]
          },
          {
            foreignKeyName: "farmers_user_profile_id_fkey"
            columns: ["user_profile_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      farming_stages: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          sample_questions: Json
          stage_description: string | null
          stage_icon: string | null
          stage_key: string
          stage_name: string
          stage_order: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          sample_questions?: Json
          stage_description?: string | null
          stage_icon?: string | null
          stage_key: string
          stage_name: string
          stage_order: number
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          sample_questions?: Json
          stage_description?: string | null
          stage_icon?: string | null
          stage_key?: string
          stage_name?: string
          stage_order?: number
        }
        Relationships: []
      }
      feature_configs: {
        Row: {
          config_data: Json | null
          created_at: string | null
          feature_name: string
          id: string
          is_enabled: boolean | null
          limits: Json | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          config_data?: Json | null
          created_at?: string | null
          feature_name: string
          id?: string
          is_enabled?: boolean | null
          limits?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          config_data?: Json | null
          created_at?: string | null
          feature_name?: string
          id?: string
          is_enabled?: boolean | null
          limits?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_environments: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          name: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          name: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          name?: string
        }
        Relationships: []
      }
      feature_flag_analytics: {
        Row: {
          created_at: string | null
          date: string
          disabled_count: number | null
          enabled_count: number | null
          flag_id: string | null
          id: string
          metrics: Json | null
          total_evaluations: number | null
          unique_tenants: number | null
          unique_users: number | null
        }
        Insert: {
          created_at?: string | null
          date: string
          disabled_count?: number | null
          enabled_count?: number | null
          flag_id?: string | null
          id?: string
          metrics?: Json | null
          total_evaluations?: number | null
          unique_tenants?: number | null
          unique_users?: number | null
        }
        Update: {
          created_at?: string | null
          date?: string
          disabled_count?: number | null
          enabled_count?: number | null
          flag_id?: string | null
          id?: string
          metrics?: Json | null
          total_evaluations?: number | null
          unique_tenants?: number | null
          unique_users?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_analytics_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_audit_log: {
        Row: {
          action: string
          change_reason: string | null
          changed_by: string | null
          created_at: string | null
          flag_id: string | null
          id: string
          new_value: Json | null
          old_value: Json | null
        }
        Insert: {
          action: string
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string | null
          flag_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Update: {
          action?: string
          change_reason?: string | null
          changed_by?: string | null
          created_at?: string | null
          flag_id?: string | null
          id?: string
          new_value?: Json | null
          old_value?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_audit_log_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flag_evaluations: {
        Row: {
          context: Json | null
          created_at: string | null
          evaluated_value: boolean | null
          evaluation_reason: string | null
          flag_id: string | null
          id: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string | null
          evaluated_value?: boolean | null
          evaluation_reason?: string | null
          flag_id?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string | null
          evaluated_value?: boolean | null
          evaluation_reason?: string | null
          flag_id?: string | null
          id?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flag_evaluations_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "feature_flag_evaluations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      feature_flags: {
        Row: {
          conditions: Json | null
          created_at: string
          created_by: string | null
          default_value: Json | null
          dependencies: Json | null
          description: string | null
          environment_id: string | null
          expires_at: string | null
          flag_name: string
          flag_status: string | null
          flag_type: string | null
          id: string
          is_enabled: boolean
          metadata: Json | null
          metrics: Json | null
          rollout_percentage: number
          scheduling: Json | null
          tags: Json | null
          target_tenants: string[] | null
          target_users: string[] | null
          updated_at: string
          variation_config: Json | null
        }
        Insert: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          default_value?: Json | null
          dependencies?: Json | null
          description?: string | null
          environment_id?: string | null
          expires_at?: string | null
          flag_name: string
          flag_status?: string | null
          flag_type?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          metrics?: Json | null
          rollout_percentage?: number
          scheduling?: Json | null
          tags?: Json | null
          target_tenants?: string[] | null
          target_users?: string[] | null
          updated_at?: string
          variation_config?: Json | null
        }
        Update: {
          conditions?: Json | null
          created_at?: string
          created_by?: string | null
          default_value?: Json | null
          dependencies?: Json | null
          description?: string | null
          environment_id?: string | null
          expires_at?: string | null
          flag_name?: string
          flag_status?: string | null
          flag_type?: string | null
          id?: string
          is_enabled?: boolean
          metadata?: Json | null
          metrics?: Json | null
          rollout_percentage?: number
          scheduling?: Json | null
          tags?: Json | null
          target_tenants?: string[] | null
          target_users?: string[] | null
          updated_at?: string
          variation_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "feature_flags_environment_id_fkey"
            columns: ["environment_id"]
            isOneToOne: false
            referencedRelation: "feature_environments"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_analytics: {
        Row: {
          amount: number
          breakdown: Json | null
          created_at: string
          currency: string
          id: string
          metric_type: string
          period_end: string
          period_start: string
          period_type: string
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          amount?: number
          breakdown?: Json | null
          created_at?: string
          currency?: string
          id?: string
          metric_type: string
          period_end: string
          period_start: string
          period_type: string
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          breakdown?: Json | null
          created_at?: string
          currency?: string
          id?: string
          metric_type?: string
          period_end?: string
          period_start?: string
          period_type?: string
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_metrics: {
        Row: {
          amount: number
          category: string | null
          created_at: string | null
          currency: string | null
          id: string
          metadata: Json | null
          metric_name: string
          period_end: string | null
          period_start: string | null
          tenant_id: string | null
          timestamp: string
        }
        Insert: {
          amount: number
          category?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          metric_name: string
          period_end?: string | null
          period_start?: string | null
          tenant_id?: string | null
          timestamp?: string
        }
        Update: {
          amount?: number
          category?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string
          period_end?: string | null
          period_start?: string | null
          tenant_id?: string | null
          timestamp?: string
        }
        Relationships: [
          {
            foreignKeyName: "financial_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      financial_transactions: {
        Row: {
          amount: number
          category: string
          created_at: string
          crop_name: string | null
          currency: string
          description: string | null
          farmer_id: string
          id: string
          land_id: string | null
          metadata: Json | null
          payment_method: string | null
          receipt_url: string | null
          season: string | null
          tenant_id: string
          transaction_date: string
          transaction_type: string
          updated_at: string
        }
        Insert: {
          amount: number
          category: string
          created_at?: string
          crop_name?: string | null
          currency?: string
          description?: string | null
          farmer_id: string
          id?: string
          land_id?: string | null
          metadata?: Json | null
          payment_method?: string | null
          receipt_url?: string | null
          season?: string | null
          tenant_id: string
          transaction_date: string
          transaction_type: string
          updated_at?: string
        }
        Update: {
          amount?: number
          category?: string
          created_at?: string
          crop_name?: string | null
          currency?: string
          description?: string | null
          farmer_id?: string
          id?: string
          land_id?: string | null
          metadata?: Json | null
          payment_method?: string | null
          receipt_url?: string | null
          season?: string | null
          tenant_id?: string
          transaction_date?: string
          transaction_type?: string
          updated_at?: string
        }
        Relationships: []
      }
      followers: {
        Row: {
          followed_at: string | null
          follower_id: string
          following_id: string
          id: string
        }
        Insert: {
          followed_at?: string | null
          follower_id: string
          following_id: string
          id?: string
        }
        Update: {
          followed_at?: string | null
          follower_id?: string
          following_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "followers_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followers_follower_id_fkey"
            columns: ["follower_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "followers_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followers_following_id_fkey"
            columns: ["following_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      group_chat_members: {
        Row: {
          farmer_id: string
          group_id: string
          id: string
          joined_at: string | null
          last_read_at: string | null
          role: string | null
        }
        Insert: {
          farmer_id: string
          group_id: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
        }
        Update: {
          farmer_id?: string
          group_id?: string
          id?: string
          joined_at?: string | null
          last_read_at?: string | null
          role?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_members_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chat_members_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "group_chat_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chat_messages: {
        Row: {
          content: string
          created_at: string
          farmer_id: string
          group_id: string
          id: string
          message_type: string | null
          metadata: Json | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string
          farmer_id: string
          group_id: string
          id?: string
          message_type?: string | null
          metadata?: Json | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string
          farmer_id?: string
          group_id?: string
          id?: string
          message_type?: string | null
          metadata?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_chat_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      group_chats: {
        Row: {
          avatar_url: string | null
          community_id: string | null
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          member_count: number | null
          name: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          member_count?: number | null
          name: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          community_id?: string | null
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          member_count?: number | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "group_chats_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_chats_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      group_messages: {
        Row: {
          content: string
          created_at: string | null
          group_id: string
          id: string
          media_url: string | null
          original_language: string | null
          sender_id: string
          translations: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          group_id: string
          id?: string
          media_url?: string | null
          original_language?: string | null
          sender_id: string
          translations?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          group_id?: string
          id?: string
          media_url?: string | null
          original_language?: string | null
          sender_id?: string
          translations?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "group_messages_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "group_chats"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "group_messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      ingest_runs: {
        Row: {
          created_at: string | null
          detail: Json | null
          fetched_count: number | null
          id: string
          run_time: string
          upserted_count: number | null
        }
        Insert: {
          created_at?: string | null
          detail?: Json | null
          fetched_count?: number | null
          id?: string
          run_time: string
          upserted_count?: number | null
        }
        Update: {
          created_at?: string | null
          detail?: Json | null
          fetched_count?: number | null
          id?: string
          run_time?: string
          upserted_count?: number | null
        }
        Relationships: []
      }
      integration_sync_logs: {
        Row: {
          completed_at: string | null
          direction: string
          error_details: Json | null
          id: string
          integration_id: string
          records_failed: number
          records_processed: number
          records_success: number
          started_at: string
          status: string
          sync_type: string
        }
        Insert: {
          completed_at?: string | null
          direction: string
          error_details?: Json | null
          id?: string
          integration_id: string
          records_failed?: number
          records_processed?: number
          records_success?: number
          started_at?: string
          status?: string
          sync_type: string
        }
        Update: {
          completed_at?: string | null
          direction?: string
          error_details?: Json | null
          id?: string
          integration_id?: string
          records_failed?: number
          records_processed?: number
          records_success?: number
          started_at?: string
          status?: string
          sync_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "integration_sync_logs_integration_id_fkey"
            columns: ["integration_id"]
            isOneToOne: false
            referencedRelation: "integrations"
            referencedColumns: ["id"]
          },
        ]
      }
      integrations: {
        Row: {
          configuration: Json
          created_at: string
          credentials: Json
          error_log: string | null
          field_mappings: Json
          id: string
          integration_type: string
          is_active: boolean
          last_sync_at: string | null
          name: string
          sync_settings: Json
          sync_status: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          configuration?: Json
          created_at?: string
          credentials?: Json
          error_log?: string | null
          field_mappings?: Json
          id?: string
          integration_type: string
          is_active?: boolean
          last_sync_at?: string | null
          name: string
          sync_settings?: Json
          sync_status?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          configuration?: Json
          created_at?: string
          credentials?: Json
          error_log?: string | null
          field_mappings?: Json
          id?: string
          integration_type?: string
          is_active?: boolean
          last_sync_at?: string | null
          name?: string
          sync_settings?: Json
          sync_status?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          dealer_id: string | null
          farmer_id: string | null
          id: string
          movement_type: string
          notes: string | null
          order_id: string | null
          product_id: string
          quantity_change: number
          reference_number: string | null
          stock_after: number
          stock_before: number
          tenant_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          farmer_id?: string | null
          id?: string
          movement_type: string
          notes?: string | null
          order_id?: string | null
          product_id: string
          quantity_change: number
          reference_number?: string | null
          stock_after: number
          stock_before: number
          tenant_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          farmer_id?: string | null
          id?: string
          movement_type?: string
          notes?: string | null
          order_id?: string | null
          product_id?: string
          quantity_change?: number
          reference_number?: string | null
          stock_after?: number
          stock_before?: number
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "inventory_movements_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invites: {
        Row: {
          created_at: string
          created_by: string | null
          email: string
          expires_at: string
          id: string
          metadata: Json | null
          role: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          email: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          email?: string
          expires_at?: string
          id?: string
          metadata?: Json | null
          role?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      invoice_line_items: {
        Row: {
          addon_id: string | null
          amount: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          metadata: Json | null
          plan_id: string | null
          quantity: number
          unit_price: number
        }
        Insert: {
          addon_id?: string | null
          amount: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          metadata?: Json | null
          plan_id?: string | null
          quantity?: number
          unit_price: number
        }
        Update: {
          addon_id?: string | null
          amount?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          metadata?: Json | null
          plan_id?: string | null
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_line_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_line_items_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_templates: {
        Row: {
          company_details: Json
          created_at: string | null
          currency: string | null
          custom_fields: Json | null
          digital_signature_enabled: boolean | null
          id: string
          is_default: boolean | null
          locale: string | null
          qr_code_enabled: boolean | null
          tax_details: Json | null
          template_name: string
          template_type: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          company_details: Json
          created_at?: string | null
          currency?: string | null
          custom_fields?: Json | null
          digital_signature_enabled?: boolean | null
          id?: string
          is_default?: boolean | null
          locale?: string | null
          qr_code_enabled?: boolean | null
          tax_details?: Json | null
          template_name: string
          template_type?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          company_details?: Json
          created_at?: string | null
          currency?: string | null
          custom_fields?: Json | null
          digital_signature_enabled?: boolean | null
          id?: string
          is_default?: boolean | null
          locale?: string | null
          qr_code_enabled?: boolean | null
          tax_details?: Json | null
          template_name?: string
          template_type?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "invoice_templates_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount: number
          created_at: string
          currency: string
          due_date: string
          id: string
          invoice_number: string
          line_items: Json
          metadata: Json | null
          paid_date: string | null
          paypal_invoice_id: string | null
          status: string
          stripe_invoice_id: string | null
          subscription_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          due_date: string
          id?: string
          invoice_number: string
          line_items?: Json
          metadata?: Json | null
          paid_date?: string | null
          paypal_invoice_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          due_date?: string
          id?: string
          invoice_number?: string
          line_items?: Json
          metadata?: Json | null
          paid_date?: string | null
          paypal_invoice_id?: string | null
          status?: string
          stripe_invoice_id?: string | null
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      irrigation_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          value?: string
        }
        Relationships: []
      }
      land_activities: {
        Row: {
          activity_date: string
          activity_type: string
          cost: number | null
          created_at: string
          description: string | null
          id: string
          land_id: string
          notes: string | null
          quantity: number | null
          tenant_id: string
          unit: string | null
        }
        Insert: {
          activity_date: string
          activity_type: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          land_id: string
          notes?: string | null
          quantity?: number | null
          tenant_id: string
          unit?: string | null
        }
        Update: {
          activity_date?: string
          activity_type?: string
          cost?: number | null
          created_at?: string
          description?: string | null
          id?: string
          land_id?: string
          notes?: string | null
          quantity?: number | null
          tenant_id?: string
          unit?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_land_activities_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_activities_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_activities_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "land_activities_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "land_activities_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_activities_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_activities_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      land_clusters: {
        Row: {
          bbox_area_km2: number | null
          cluster_bbox: Json
          cluster_key: string
          created_at: string | null
          id: string
          land_count: number
          land_ids: string[]
          last_processed_at: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          bbox_area_km2?: number | null
          cluster_bbox: Json
          cluster_key: string
          created_at?: string | null
          id?: string
          land_count: number
          land_ids: string[]
          last_processed_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          bbox_area_km2?: number | null
          cluster_bbox?: Json
          cluster_key?: string
          created_at?: string | null
          id?: string
          land_count?: number
          land_ids?: string[]
          last_processed_at?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "land_clusters_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      land_crops: {
        Row: {
          actual_harvest_date: string | null
          area_acres: number | null
          area_percentage: number | null
          created_at: string | null
          crop_id: string | null
          crop_name: string
          crop_name_local: string | null
          crop_type: string
          crop_variety: string | null
          expected_harvest_date: string | null
          farmer_id: string
          farming_type: string | null
          id: string
          is_active: boolean | null
          land_id: string
          metadata: Json | null
          notes: string | null
          schedule_id: string | null
          sowing_date: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          actual_harvest_date?: string | null
          area_acres?: number | null
          area_percentage?: number | null
          created_at?: string | null
          crop_id?: string | null
          crop_name: string
          crop_name_local?: string | null
          crop_type?: string
          crop_variety?: string | null
          expected_harvest_date?: string | null
          farmer_id: string
          farming_type?: string | null
          id?: string
          is_active?: boolean | null
          land_id: string
          metadata?: Json | null
          notes?: string | null
          schedule_id?: string | null
          sowing_date?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          actual_harvest_date?: string | null
          area_acres?: number | null
          area_percentage?: number | null
          created_at?: string | null
          crop_id?: string | null
          crop_name?: string
          crop_name_local?: string | null
          crop_type?: string
          crop_variety?: string | null
          expected_harvest_date?: string | null
          farmer_id?: string
          farming_type?: string | null
          id?: string
          is_active?: boolean | null
          land_id?: string
          metadata?: Json | null
          notes?: string | null
          schedule_id?: string | null
          sowing_date?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "land_crops_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_crops_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "land_crops_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "land_crops_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_crops_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_crops_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_crops_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "crop_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      land_tile_intersections: {
        Row: {
          created_at: string | null
          id: string
          land_id: string
          tile_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          land_id: string
          tile_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          land_id?: string
          tile_id?: string
        }
        Relationships: []
      }
      land_tile_mapping: {
        Row: {
          created_at: string | null
          farmer_id: string
          id: string
          land_area_acres: number | null
          land_area_hectares: number | null
          land_bbox: Json
          land_centroid: Json | null
          land_id: string
          last_ndvi_request_date: string | null
          last_ndvi_value: number | null
          mgrs_tile_id: string | null
          ndvi_cache_expiry: string | null
          needs_refresh: boolean | null
          request_priority: number | null
          tenant_id: string
          tile_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          farmer_id: string
          id?: string
          land_area_acres?: number | null
          land_area_hectares?: number | null
          land_bbox: Json
          land_centroid?: Json | null
          land_id: string
          last_ndvi_request_date?: string | null
          last_ndvi_value?: number | null
          mgrs_tile_id?: string | null
          ndvi_cache_expiry?: string | null
          needs_refresh?: boolean | null
          request_priority?: number | null
          tenant_id: string
          tile_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          farmer_id?: string
          id?: string
          land_area_acres?: number | null
          land_area_hectares?: number | null
          land_bbox?: Json
          land_centroid?: Json | null
          land_id?: string
          last_ndvi_request_date?: string | null
          last_ndvi_value?: number | null
          mgrs_tile_id?: string | null
          ndvi_cache_expiry?: string | null
          needs_refresh?: boolean | null
          request_priority?: number | null
          tenant_id?: string
          tile_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "land_tile_mapping_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_tile_mapping_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "land_tile_mapping_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: true
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_tile_mapping_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: true
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "land_tile_mapping_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: true
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "land_tile_mapping_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: true
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_tile_mapping_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: true
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_tile_mapping_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: true
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "land_tile_mapping_mgrs_tile_id_fkey"
            columns: ["mgrs_tile_id"]
            isOneToOne: false
            referencedRelation: "mgrs_tiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "land_tile_mapping_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      lands: {
        Row: {
          area_acres: number
          area_guntas: number | null
          area_sqft: number | null
          boundary: unknown
          boundary_geom: unknown
          boundary_method: string | null
          boundary_polygon_old: Json | null
          center_lat: number | null
          center_lon: number | null
          center_point_old: Json | null
          created_at: string
          crop_stage: string | null
          cultivation_date: string | null
          current_crop: string | null
          current_crop_id: string | null
          current_moisture_status: string | null
          deleted_at: string | null
          district: string | null
          district_id: string | null
          elevation_meters: number | null
          expected_harvest_date: string | null
          farmer_id: string
          gps_accuracy_meters: number | null
          gps_recorded_at: string | null
          harvest_date: string | null
          id: string
          irrigation_source: string | null
          irrigation_type: string | null
          is_active: boolean | null
          land_documents: Json | null
          land_type: string | null
          last_crop: string | null
          last_harvest_date: string | null
          last_moisture_update: string | null
          last_ndvi_calculation: string | null
          last_ndvi_value: number | null
          last_processed_at: string | null
          last_soil_test_date: string | null
          last_sowing_date: string | null
          location_context: Json | null
          location_coords: Json | null
          marketplace_enabled: boolean | null
          mgrs_tile_id: string | null
          name: string
          ndvi_geotiff_url: string | null
          ndvi_status: string | null
          ndvi_tested: boolean | null
          ndvi_thumbnail_url: string | null
          nitrogen_kg_per_ha: number | null
          notes: string | null
          organic_carbon_percent: number | null
          ownership_type: string | null
          phosphorus_kg_per_ha: number | null
          planting_date: string | null
          potassium_kg_per_ha: number | null
          previous_crop: string | null
          previous_crop_id: string | null
          slope_percentage: number | null
          soil_confidence_level: string | null
          soil_data_source: string | null
          soil_ph: number | null
          soil_tested: boolean | null
          soil_type: string | null
          state: string | null
          state_id: string | null
          survey_number: string | null
          taluka: string | null
          taluka_id: string | null
          tenant_id: string
          tile_id: string | null
          tile_ids: string[] | null
          updated_at: string
          village: string | null
          village_id: string | null
          water_source: string | null
        }
        Insert: {
          area_acres: number
          area_guntas?: number | null
          area_sqft?: number | null
          boundary?: unknown
          boundary_geom?: unknown
          boundary_method?: string | null
          boundary_polygon_old?: Json | null
          center_lat?: number | null
          center_lon?: number | null
          center_point_old?: Json | null
          created_at?: string
          crop_stage?: string | null
          cultivation_date?: string | null
          current_crop?: string | null
          current_crop_id?: string | null
          current_moisture_status?: string | null
          deleted_at?: string | null
          district?: string | null
          district_id?: string | null
          elevation_meters?: number | null
          expected_harvest_date?: string | null
          farmer_id: string
          gps_accuracy_meters?: number | null
          gps_recorded_at?: string | null
          harvest_date?: string | null
          id?: string
          irrigation_source?: string | null
          irrigation_type?: string | null
          is_active?: boolean | null
          land_documents?: Json | null
          land_type?: string | null
          last_crop?: string | null
          last_harvest_date?: string | null
          last_moisture_update?: string | null
          last_ndvi_calculation?: string | null
          last_ndvi_value?: number | null
          last_processed_at?: string | null
          last_soil_test_date?: string | null
          last_sowing_date?: string | null
          location_context?: Json | null
          location_coords?: Json | null
          marketplace_enabled?: boolean | null
          mgrs_tile_id?: string | null
          name: string
          ndvi_geotiff_url?: string | null
          ndvi_status?: string | null
          ndvi_tested?: boolean | null
          ndvi_thumbnail_url?: string | null
          nitrogen_kg_per_ha?: number | null
          notes?: string | null
          organic_carbon_percent?: number | null
          ownership_type?: string | null
          phosphorus_kg_per_ha?: number | null
          planting_date?: string | null
          potassium_kg_per_ha?: number | null
          previous_crop?: string | null
          previous_crop_id?: string | null
          slope_percentage?: number | null
          soil_confidence_level?: string | null
          soil_data_source?: string | null
          soil_ph?: number | null
          soil_tested?: boolean | null
          soil_type?: string | null
          state?: string | null
          state_id?: string | null
          survey_number?: string | null
          taluka?: string | null
          taluka_id?: string | null
          tenant_id: string
          tile_id?: string | null
          tile_ids?: string[] | null
          updated_at?: string
          village?: string | null
          village_id?: string | null
          water_source?: string | null
        }
        Update: {
          area_acres?: number
          area_guntas?: number | null
          area_sqft?: number | null
          boundary?: unknown
          boundary_geom?: unknown
          boundary_method?: string | null
          boundary_polygon_old?: Json | null
          center_lat?: number | null
          center_lon?: number | null
          center_point_old?: Json | null
          created_at?: string
          crop_stage?: string | null
          cultivation_date?: string | null
          current_crop?: string | null
          current_crop_id?: string | null
          current_moisture_status?: string | null
          deleted_at?: string | null
          district?: string | null
          district_id?: string | null
          elevation_meters?: number | null
          expected_harvest_date?: string | null
          farmer_id?: string
          gps_accuracy_meters?: number | null
          gps_recorded_at?: string | null
          harvest_date?: string | null
          id?: string
          irrigation_source?: string | null
          irrigation_type?: string | null
          is_active?: boolean | null
          land_documents?: Json | null
          land_type?: string | null
          last_crop?: string | null
          last_harvest_date?: string | null
          last_moisture_update?: string | null
          last_ndvi_calculation?: string | null
          last_ndvi_value?: number | null
          last_processed_at?: string | null
          last_soil_test_date?: string | null
          last_sowing_date?: string | null
          location_context?: Json | null
          location_coords?: Json | null
          marketplace_enabled?: boolean | null
          mgrs_tile_id?: string | null
          name?: string
          ndvi_geotiff_url?: string | null
          ndvi_status?: string | null
          ndvi_tested?: boolean | null
          ndvi_thumbnail_url?: string | null
          nitrogen_kg_per_ha?: number | null
          notes?: string | null
          organic_carbon_percent?: number | null
          ownership_type?: string | null
          phosphorus_kg_per_ha?: number | null
          planting_date?: string | null
          potassium_kg_per_ha?: number | null
          previous_crop?: string | null
          previous_crop_id?: string | null
          slope_percentage?: number | null
          soil_confidence_level?: string | null
          soil_data_source?: string | null
          soil_ph?: number | null
          soil_tested?: boolean | null
          soil_type?: string | null
          state?: string | null
          state_id?: string | null
          survey_number?: string | null
          taluka?: string | null
          taluka_id?: string | null
          tenant_id?: string
          tile_id?: string | null
          tile_ids?: string[] | null
          updated_at?: string
          village?: string | null
          village_id?: string | null
          water_source?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_lands_district"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_lands_state"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_lands_taluka"
            columns: ["taluka_id"]
            isOneToOne: false
            referencedRelation: "talukas"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_lands_village"
            columns: ["village_id"]
            isOneToOne: false
            referencedRelation: "villages"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lands_current_crop_id_fkey"
            columns: ["current_crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lands_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lands_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "lands_mgrs_tile_id_fkey"
            columns: ["mgrs_tile_id"]
            isOneToOne: false
            referencedRelation: "mgrs_tiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lands_previous_crop_id_fkey"
            columns: ["previous_crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          activity_type: string
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          lead_id: string | null
          metadata: Json | null
          outcome: string | null
          scheduled_at: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          activity_type: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          outcome?: string | null
          scheduled_at?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          activity_type?: string
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          outcome?: string | null
          scheduled_at?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignment_rules: {
        Row: {
          admin_pool: string[]
          conditions: Json | null
          created_at: string | null
          created_by: string | null
          id: string
          is_active: boolean | null
          priority_order: number | null
          rule_name: string
          rule_type: string
          updated_at: string | null
        }
        Insert: {
          admin_pool: string[]
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          priority_order?: number | null
          rule_name: string
          rule_type: string
          updated_at?: string | null
        }
        Update: {
          admin_pool?: string[]
          conditions?: Json | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          is_active?: boolean | null
          priority_order?: number | null
          rule_name?: string
          rule_type?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignment_rules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_assignments: {
        Row: {
          assigned_at: string | null
          assigned_from: string | null
          assigned_to: string
          assignment_reason: string | null
          assignment_type: string
          id: string
          lead_id: string
          metadata: Json | null
        }
        Insert: {
          assigned_at?: string | null
          assigned_from?: string | null
          assigned_to: string
          assignment_reason?: string | null
          assignment_type: string
          id?: string
          lead_id: string
          metadata?: Json | null
        }
        Update: {
          assigned_at?: string | null
          assigned_from?: string | null
          assigned_to?: string
          assignment_reason?: string | null
          assignment_type?: string
          id?: string
          lead_id?: string
          metadata?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_assignments_assigned_from_fkey"
            columns: ["assigned_from"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_assignments_assigned_to_fkey"
            columns: ["assigned_to"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_audit_logs: {
        Row: {
          action_type: string
          context: Json | null
          created_at: string | null
          id: string
          lead_id: string
          new_values: Json | null
          old_values: Json | null
          performed_by: string | null
          source: string | null
          tenant_id: string
        }
        Insert: {
          action_type: string
          context?: Json | null
          created_at?: string | null
          id?: string
          lead_id: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          source?: string | null
          tenant_id: string
        }
        Update: {
          action_type?: string
          context?: Json | null
          created_at?: string | null
          id?: string
          lead_id?: string
          new_values?: Json | null
          old_values?: Json | null
          performed_by?: string | null
          source?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_audit_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_communication_logs: {
        Row: {
          communication_type: string
          content: string | null
          created_at: string | null
          created_by: string | null
          direction: string
          id: string
          lead_id: string | null
          metadata: Json | null
          opened_at: string | null
          replied_at: string | null
          sent_at: string | null
          status: string | null
          subject: string | null
        }
        Insert: {
          communication_type: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          direction: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Update: {
          communication_type?: string
          content?: string | null
          created_at?: string | null
          created_by?: string | null
          direction?: string
          id?: string
          lead_id?: string | null
          metadata?: Json | null
          opened_at?: string | null
          replied_at?: string | null
          sent_at?: string | null
          status?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "lead_communication_logs_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_communication_templates: {
        Row: {
          content: string
          created_at: string | null
          id: string
          is_active: boolean | null
          subject: string | null
          template_name: string
          template_type: string
          tenant_id: string
          updated_at: string | null
          variables: Json | null
        }
        Insert: {
          content: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject?: string | null
          template_name: string
          template_type: string
          tenant_id: string
          updated_at?: string | null
          variables?: Json | null
        }
        Update: {
          content?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          subject?: string | null
          template_name?: string
          template_type?: string
          tenant_id?: string
          updated_at?: string | null
          variables?: Json | null
        }
        Relationships: []
      }
      lead_custom_fields: {
        Row: {
          created_at: string | null
          field_label: string | null
          field_name: string
          field_order: number | null
          field_type: string
          id: string
          is_active: boolean | null
          is_required: boolean | null
          options: Json | null
          tenant_id: string
          updated_at: string | null
          validation_rules: Json | null
        }
        Insert: {
          created_at?: string | null
          field_label?: string | null
          field_name: string
          field_order?: number | null
          field_type: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          tenant_id: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Update: {
          created_at?: string | null
          field_label?: string | null
          field_name?: string
          field_order?: number | null
          field_type?: string
          id?: string
          is_active?: boolean | null
          is_required?: boolean | null
          options?: Json | null
          tenant_id?: string
          updated_at?: string | null
          validation_rules?: Json | null
        }
        Relationships: []
      }
      lead_scoring_rules: {
        Row: {
          conditions: Json
          created_at: string | null
          id: string
          is_active: boolean | null
          rule_name: string
          rule_type: string
          score_value: number
          updated_at: string | null
        }
        Insert: {
          conditions: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          rule_name: string
          rule_type: string
          score_value: number
          updated_at?: string | null
        }
        Update: {
          conditions?: Json
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          rule_name?: string
          rule_type?: string
          score_value?: number
          updated_at?: string | null
        }
        Relationships: []
      }
      lead_tags: {
        Row: {
          created_at: string | null
          created_by: string | null
          id: string
          lead_id: string | null
          tag_color: string | null
          tag_name: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id?: string | null
          tag_color?: string | null
          tag_name: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          id?: string
          lead_id?: string | null
          tag_color?: string | null
          tag_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_tags_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      leaderboards: {
        Row: {
          created_at: string | null
          farmer_id: string
          id: string
          leaderboard_type: string
          period_end: string | null
          period_start: string | null
          points: number | null
          rank: number | null
          reference_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          farmer_id: string
          id?: string
          leaderboard_type: string
          period_end?: string | null
          period_start?: string | null
          points?: number | null
          rank?: number | null
          reference_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          farmer_id?: string
          id?: string
          leaderboard_type?: string
          period_end?: string | null
          period_start?: string | null
          points?: number | null
          rank?: number | null
          reference_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leaderboards_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leaderboards_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      leads: {
        Row: {
          ai_recommended_action: string | null
          ai_score: number | null
          assigned_at: string | null
          assigned_to: string | null
          budget_range: string | null
          campaign_id: string | null
          company_size: string | null
          contact_name: string
          contract_sent: boolean | null
          converted_at: string | null
          converted_tenant_id: string | null
          created_at: string | null
          created_by: string | null
          current_solution: string | null
          custom_fields: Json | null
          demo_scheduled: boolean | null
          email: string
          expected_farmers: number | null
          follow_up_date: string | null
          how_did_you_hear: string | null
          id: string
          last_activity: string | null
          last_contact_at: string | null
          lead_score: number | null
          lead_source: string | null
          lead_temperature: string | null
          marketing_qualified: boolean | null
          metadata: Json | null
          next_follow_up_at: string | null
          notes: string | null
          organization_name: string
          organization_type: string
          phone: string
          priority: string | null
          proposal_sent: boolean | null
          qualification_score: number | null
          rejection_reason: string | null
          requirements: string | null
          sales_qualified: boolean | null
          source: string | null
          source_id: string | null
          status: string
          timeline: string | null
          updated_at: string | null
        }
        Insert: {
          ai_recommended_action?: string | null
          ai_score?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          budget_range?: string | null
          campaign_id?: string | null
          company_size?: string | null
          contact_name: string
          contract_sent?: boolean | null
          converted_at?: string | null
          converted_tenant_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_solution?: string | null
          custom_fields?: Json | null
          demo_scheduled?: boolean | null
          email: string
          expected_farmers?: number | null
          follow_up_date?: string | null
          how_did_you_hear?: string | null
          id?: string
          last_activity?: string | null
          last_contact_at?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_temperature?: string | null
          marketing_qualified?: boolean | null
          metadata?: Json | null
          next_follow_up_at?: string | null
          notes?: string | null
          organization_name: string
          organization_type: string
          phone: string
          priority?: string | null
          proposal_sent?: boolean | null
          qualification_score?: number | null
          rejection_reason?: string | null
          requirements?: string | null
          sales_qualified?: boolean | null
          source?: string | null
          source_id?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string | null
        }
        Update: {
          ai_recommended_action?: string | null
          ai_score?: number | null
          assigned_at?: string | null
          assigned_to?: string | null
          budget_range?: string | null
          campaign_id?: string | null
          company_size?: string | null
          contact_name?: string
          contract_sent?: boolean | null
          converted_at?: string | null
          converted_tenant_id?: string | null
          created_at?: string | null
          created_by?: string | null
          current_solution?: string | null
          custom_fields?: Json | null
          demo_scheduled?: boolean | null
          email?: string
          expected_farmers?: number | null
          follow_up_date?: string | null
          how_did_you_hear?: string | null
          id?: string
          last_activity?: string | null
          last_contact_at?: string | null
          lead_score?: number | null
          lead_source?: string | null
          lead_temperature?: string | null
          marketing_qualified?: boolean | null
          metadata?: Json | null
          next_follow_up_at?: string | null
          notes?: string | null
          organization_name?: string
          organization_type?: string
          phone?: string
          priority?: string | null
          proposal_sent?: boolean | null
          qualification_score?: number | null
          rejection_reason?: string | null
          requirements?: string | null
          sales_qualified?: boolean | null
          source?: string | null
          source_id?: string | null
          status?: string
          timeline?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "leads_converted_tenant_id_fkey"
            columns: ["converted_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      learning_suggestions: {
        Row: {
          category: string | null
          confidence_score: number | null
          created_at: string | null
          description: string
          evidence_count: number | null
          id: string
          implementation_notes: string | null
          priority: string | null
          recommendation: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          status: string | null
          suggestion_type: string | null
          supporting_data: Json | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          category?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description: string
          evidence_count?: number | null
          id?: string
          implementation_notes?: string | null
          priority?: string | null
          recommendation?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggestion_type?: string | null
          supporting_data?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          category?: string | null
          confidence_score?: number | null
          created_at?: string | null
          description?: string
          evidence_count?: number | null
          id?: string
          implementation_notes?: string | null
          priority?: string | null
          recommendation?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string | null
          suggestion_type?: string | null
          supporting_data?: Json | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "learning_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      localization_settings: {
        Row: {
          created_at: string | null
          currency: string | null
          custom_translations: Json | null
          date_format: string | null
          default_language: string | null
          id: string
          number_format: Json | null
          regional_settings: Json | null
          supported_languages: Json | null
          tenant_id: string
          time_format: string | null
          timezone: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          currency?: string | null
          custom_translations?: Json | null
          date_format?: string | null
          default_language?: string | null
          id?: string
          number_format?: Json | null
          regional_settings?: Json | null
          supported_languages?: Json | null
          tenant_id: string
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          currency?: string | null
          custom_translations?: Json | null
          date_format?: string | null
          default_language?: string | null
          id?: string
          number_format?: Json | null
          regional_settings?: Json | null
          supported_languages?: Json | null
          tenant_id?: string
          time_format?: string | null
          timezone?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "localization_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      market_price_subscriptions: {
        Row: {
          commodities: Json
          created_at: string | null
          id: string
          notification_enabled: boolean | null
          organization_id: string
          price_threshold: Json | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          commodities?: Json
          created_at?: string | null
          id?: string
          notification_enabled?: boolean | null
          organization_id: string
          price_threshold?: Json | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          commodities?: Json
          created_at?: string | null
          id?: string
          notification_enabled?: boolean | null
          organization_id?: string
          price_threshold?: Json | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      market_prices: {
        Row: {
          arrival: number | null
          commodity_category: string | null
          commodity_code: string | null
          commodity_name_normalized: string | null
          country_id: string | null
          created_at: string
          crop_name: string
          district: string | null
          fetched_at: string | null
          global_commodity_code: string | null
          id: string
          ingested_at: string | null
          market_location: string
          max_price: number | null
          metadata: Json | null
          min_price: number | null
          modal_price: number | null
          price_date: string
          price_per_unit: number
          price_type: string | null
          quality_grade: string | null
          raw_html: string | null
          source: string | null
          source_id: string | null
          spread: number | null
          state: string | null
          state_id: string | null
          status: string | null
          unit: string
          updated_at: string | null
          variety: string | null
        }
        Insert: {
          arrival?: number | null
          commodity_category?: string | null
          commodity_code?: string | null
          commodity_name_normalized?: string | null
          country_id?: string | null
          created_at?: string
          crop_name: string
          district?: string | null
          fetched_at?: string | null
          global_commodity_code?: string | null
          id?: string
          ingested_at?: string | null
          market_location: string
          max_price?: number | null
          metadata?: Json | null
          min_price?: number | null
          modal_price?: number | null
          price_date: string
          price_per_unit: number
          price_type?: string | null
          quality_grade?: string | null
          raw_html?: string | null
          source?: string | null
          source_id?: string | null
          spread?: number | null
          state?: string | null
          state_id?: string | null
          status?: string | null
          unit?: string
          updated_at?: string | null
          variety?: string | null
        }
        Update: {
          arrival?: number | null
          commodity_category?: string | null
          commodity_code?: string | null
          commodity_name_normalized?: string | null
          country_id?: string | null
          created_at?: string
          crop_name?: string
          district?: string | null
          fetched_at?: string | null
          global_commodity_code?: string | null
          id?: string
          ingested_at?: string | null
          market_location?: string
          max_price?: number | null
          metadata?: Json | null
          min_price?: number | null
          modal_price?: number | null
          price_date?: string
          price_per_unit?: number
          price_type?: string | null
          quality_grade?: string | null
          raw_html?: string | null
          source?: string | null
          source_id?: string | null
          spread?: number | null
          state?: string | null
          state_id?: string | null
          status?: string | null
          unit?: string
          updated_at?: string | null
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_market_prices_country"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_market_prices_source"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "agri_market_sources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_market_prices_state"
            columns: ["state_id"]
            isOneToOne: false
            referencedRelation: "states"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_categories: {
        Row: {
          created_at: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "marketplace_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_chat_messages: {
        Row: {
          attachments: Json | null
          chat_id: string | null
          created_at: string | null
          id: string
          is_read: boolean | null
          message: string
          sender_id: string
        }
        Insert: {
          attachments?: Json | null
          chat_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          sender_id: string
        }
        Update: {
          attachments?: Json | null
          chat_id?: string | null
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          sender_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_chat_messages_chat_id_fkey"
            columns: ["chat_id"]
            isOneToOne: false
            referencedRelation: "marketplace_chats"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_chats: {
        Row: {
          buyer_id: string
          buyer_unread: number | null
          created_at: string | null
          id: string
          last_message: string | null
          last_message_at: string | null
          product_id: string | null
          seller_id: string | null
          seller_unread: number | null
        }
        Insert: {
          buyer_id: string
          buyer_unread?: number | null
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          product_id?: string | null
          seller_id?: string | null
          seller_unread?: number | null
        }
        Update: {
          buyer_id?: string
          buyer_unread?: number | null
          created_at?: string | null
          id?: string
          last_message?: string | null
          last_message_at?: string | null
          product_id?: string | null
          seller_id?: string | null
          seller_unread?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_chats_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "marketplace_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_chats_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_chats_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      marketplace_orders: {
        Row: {
          buyer_id: string
          created_at: string | null
          farmer_id: string | null
          id: string
          notes: string | null
          order_number: string
          order_status: string | null
          payment_method: string | null
          payment_status: string | null
          seller_id: string | null
          shipping_address: Json
          tenant_id: string | null
          total_amount: number
          tracking_number: string | null
          updated_at: string | null
        }
        Insert: {
          buyer_id: string
          created_at?: string | null
          farmer_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          order_status?: string | null
          payment_method?: string | null
          payment_status?: string | null
          seller_id?: string | null
          shipping_address: Json
          tenant_id?: string | null
          total_amount: number
          tracking_number?: string | null
          updated_at?: string | null
        }
        Update: {
          buyer_id?: string
          created_at?: string | null
          farmer_id?: string | null
          id?: string
          notes?: string | null
          order_number?: string
          order_status?: string | null
          payment_method?: string | null
          payment_status?: string | null
          seller_id?: string | null
          shipping_address?: Json
          tenant_id?: string | null
          total_amount?: number
          tracking_number?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "marketplace_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_orders_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "marketplace_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_products: {
        Row: {
          category_id: string | null
          created_at: string | null
          description: string | null
          discount_price: number | null
          farmer_id: string | null
          featured: boolean | null
          id: string
          images: Json | null
          land_id: string | null
          name: string
          price: number
          quantity_available: number
          seller_id: string | null
          specifications: Json | null
          status: string | null
          tags: string[] | null
          tenant_id: string | null
          unit: string
          updated_at: string | null
          views: number | null
        }
        Insert: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_price?: number | null
          farmer_id?: string | null
          featured?: boolean | null
          id?: string
          images?: Json | null
          land_id?: string | null
          name: string
          price: number
          quantity_available?: number
          seller_id?: string | null
          specifications?: Json | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          unit: string
          updated_at?: string | null
          views?: number | null
        }
        Update: {
          category_id?: string | null
          created_at?: string | null
          description?: string | null
          discount_price?: number | null
          farmer_id?: string | null
          featured?: boolean | null
          id?: string
          images?: Json | null
          land_id?: string | null
          name?: string
          price?: number
          quantity_available?: number
          seller_id?: string | null
          specifications?: Json | null
          status?: string | null
          tags?: string[] | null
          tenant_id?: string | null
          unit?: string
          updated_at?: string | null
          views?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "marketplace_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "marketplace_products_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "marketplace_products_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "marketplace_products_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "marketplace_products_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "marketplace_products_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "marketplace_products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "marketplace_products_seller_id_fkey"
            columns: ["seller_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "marketplace_products_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_reviews: {
        Row: {
          created_at: string
          helpful_count: number | null
          id: string
          images: string[] | null
          is_verified: boolean | null
          rating: number | null
          review_text: string | null
          reviewed_entity_id: string
          reviewed_entity_type: string
          reviewer_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          helpful_count?: number | null
          id?: string
          images?: string[] | null
          is_verified?: boolean | null
          rating?: number | null
          review_text?: string | null
          reviewed_entity_id: string
          reviewed_entity_type: string
          reviewer_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          helpful_count?: number | null
          id?: string
          images?: string[] | null
          is_verified?: boolean | null
          rating?: number | null
          review_text?: string | null
          reviewed_entity_id?: string
          reviewed_entity_type?: string
          reviewer_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "marketplace_reviews_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "marketplace_transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_saved_items: {
        Row: {
          created_at: string
          id: string
          item_id: string
          item_type: string
          tenant_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          item_id: string
          item_type: string
          tenant_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          item_id?: string
          item_type?: string
          tenant_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_marketplace_saved_items_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      marketplace_transactions: {
        Row: {
          buyer_id: string
          commission_amount: number | null
          created_at: string
          delivery_address: Json | null
          delivery_date: string | null
          delivery_method: string | null
          escrow_enabled: boolean | null
          id: string
          listing_id: string | null
          notes: string | null
          payment_method: string | null
          payment_status: string | null
          product_id: string | null
          quantity: number
          seller_id: string | null
          status: string | null
          tenant_id: string
          total_amount: number
          transaction_type: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          buyer_id: string
          commission_amount?: number | null
          created_at?: string
          delivery_address?: Json | null
          delivery_date?: string | null
          delivery_method?: string | null
          escrow_enabled?: boolean | null
          id?: string
          listing_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_status?: string | null
          product_id?: string | null
          quantity: number
          seller_id?: string | null
          status?: string | null
          tenant_id: string
          total_amount: number
          transaction_type: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          buyer_id?: string
          commission_amount?: number | null
          created_at?: string
          delivery_address?: Json | null
          delivery_date?: string | null
          delivery_method?: string | null
          escrow_enabled?: boolean | null
          id?: string
          listing_id?: string | null
          notes?: string | null
          payment_method?: string | null
          payment_status?: string | null
          product_id?: string | null
          quantity?: number
          seller_id?: string | null
          status?: string | null
          tenant_id?: string
          total_amount?: number
          transaction_type?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: []
      }
      master_companies: {
        Row: {
          address: Json | null
          annual_revenue: number | null
          certifications: Json | null
          company_type: string | null
          converted_to_tenant: boolean | null
          created_at: string | null
          created_by: string | null
          description: string | null
          email: string | null
          financials: Json | null
          founded_year: number | null
          founder: string | null
          gst_number: string | null
          headquarters_address: Json | null
          hq_location: string | null
          id: string
          industry_category: string | null
          industry_subtype: string | null
          is_potential_tenant: boolean | null
          listing_status: string | null
          logo_url: string | null
          metadata: Json | null
          name: string
          num_employees: number | null
          ownership: string | null
          ownership_structure: string | null
          pan_number: string | null
          phone: string | null
          product_categories: string[] | null
          sector: string | null
          slug: string
          status: string | null
          subsidiaries: Json | null
          subtype: string | null
          tenant_id: string | null
          updated_at: string | null
          volume_metrics: Json | null
          website: string | null
          year_of_incorporation: number | null
        }
        Insert: {
          address?: Json | null
          annual_revenue?: number | null
          certifications?: Json | null
          company_type?: string | null
          converted_to_tenant?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          financials?: Json | null
          founded_year?: number | null
          founder?: string | null
          gst_number?: string | null
          headquarters_address?: Json | null
          hq_location?: string | null
          id?: string
          industry_category?: string | null
          industry_subtype?: string | null
          is_potential_tenant?: boolean | null
          listing_status?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name: string
          num_employees?: number | null
          ownership?: string | null
          ownership_structure?: string | null
          pan_number?: string | null
          phone?: string | null
          product_categories?: string[] | null
          sector?: string | null
          slug: string
          status?: string | null
          subsidiaries?: Json | null
          subtype?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          volume_metrics?: Json | null
          website?: string | null
          year_of_incorporation?: number | null
        }
        Update: {
          address?: Json | null
          annual_revenue?: number | null
          certifications?: Json | null
          company_type?: string | null
          converted_to_tenant?: boolean | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          email?: string | null
          financials?: Json | null
          founded_year?: number | null
          founder?: string | null
          gst_number?: string | null
          headquarters_address?: Json | null
          hq_location?: string | null
          id?: string
          industry_category?: string | null
          industry_subtype?: string | null
          is_potential_tenant?: boolean | null
          listing_status?: string | null
          logo_url?: string | null
          metadata?: Json | null
          name?: string
          num_employees?: number | null
          ownership?: string | null
          ownership_structure?: string | null
          pan_number?: string | null
          phone?: string | null
          product_categories?: string[] | null
          sector?: string | null
          slug?: string
          status?: string | null
          subsidiaries?: Json | null
          subtype?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          volume_metrics?: Json | null
          website?: string | null
          year_of_incorporation?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "master_companies_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      master_languages: {
        Row: {
          code: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          name: string
          native_name: string
          updated_at: string | null
        }
        Insert: {
          code: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name: string
          native_name: string
          updated_at?: string | null
        }
        Update: {
          code?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          name?: string
          native_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      master_product_categories: {
        Row: {
          created_at: string | null
          created_by: string | null
          description: string | null
          icon: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          name: string
          parent_id: string | null
          slug: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name: string
          parent_id?: string | null
          slug: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          icon?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          name?: string
          parent_id?: string | null
          slug?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "master_product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "master_product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      master_products: {
        Row: {
          active_ingredients: Json | null
          ai_metadata: Json | null
          ai_recommendable: boolean | null
          application_method: string | null
          application_timing: Json | null
          approval_authority: string | null
          approval_date: string | null
          approved_at: string | null
          approved_by: string | null
          available_pack_sizes: Json | null
          barcode: string | null
          batch_number: string | null
          brand: string | null
          cas_number: string | null
          category_id: string
          company_id: string
          compatibility_info: Json | null
          composition: string | null
          country_of_origin: string | null
          created_at: string | null
          created_by: string | null
          crop_stages: Json | null
          currency: string | null
          description: string | null
          discount_applicable: boolean | null
          discount_details: Json | null
          disease_targets: Json | null
          disposal_instructions: string | null
          distributor_id: string | null
          documents: Json | null
          dosage_instructions: string | null
          effectiveness_rating: number | null
          environmental_impact: Json | null
          expiry_date: string | null
          first_aid_measures: string | null
          germination_rate: number | null
          handling_precautions: string | null
          hsn_code: string | null
          id: string
          images: Json | null
          import_license_required: boolean | null
          is_bestseller: boolean | null
          is_featured: boolean | null
          lab_test_reports: Json | null
          manufacturer_id: string | null
          manufacturing_date: string | null
          market_availability: string | null
          maximum_order_quantity: number | null
          metadata: Json | null
          minimum_order_quantity: number | null
          mixing_instructions: string | null
          name: string
          nutrient_analysis: Json | null
          organic_certified: boolean | null
          origin_country: string | null
          packaging_options: Json | null
          pest_targets: Json | null
          ph_range: Json | null
          popularity_score: number | null
          pre_harvest_interval_days: number | null
          price_per_unit: number | null
          price_range: Json | null
          product_type: string | null
          purity_percentage: number | null
          quality_certifications: Json | null
          re_entry_interval_hours: number | null
          recommended_season: Json | null
          registration_number: string | null
          safety_data_sheet_url: string | null
          safety_level: string | null
          sales_count: number | null
          seed_variety_details: Json | null
          shelf_life_months: number | null
          sku: string
          spray_volume_per_acre: Json | null
          status: string | null
          storage_instructions: string | null
          storage_temperature_range: Json | null
          suitable_crops: Json | null
          suitable_soil_types: Json | null
          tax_rate: number | null
          technical_data_sheet_url: string | null
          translations: Json | null
          unit_of_measure: string | null
          updated_at: string | null
          usage_restrictions: string | null
          user_reviews_summary: Json | null
          video_urls: Json | null
          view_count: number | null
          warnings: string | null
          water_solubility: string | null
          weather_conditions: Json | null
          weed_targets: Json | null
        }
        Insert: {
          active_ingredients?: Json | null
          ai_metadata?: Json | null
          ai_recommendable?: boolean | null
          application_method?: string | null
          application_timing?: Json | null
          approval_authority?: string | null
          approval_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          available_pack_sizes?: Json | null
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          cas_number?: string | null
          category_id: string
          company_id: string
          compatibility_info?: Json | null
          composition?: string | null
          country_of_origin?: string | null
          created_at?: string | null
          created_by?: string | null
          crop_stages?: Json | null
          currency?: string | null
          description?: string | null
          discount_applicable?: boolean | null
          discount_details?: Json | null
          disease_targets?: Json | null
          disposal_instructions?: string | null
          distributor_id?: string | null
          documents?: Json | null
          dosage_instructions?: string | null
          effectiveness_rating?: number | null
          environmental_impact?: Json | null
          expiry_date?: string | null
          first_aid_measures?: string | null
          germination_rate?: number | null
          handling_precautions?: string | null
          hsn_code?: string | null
          id?: string
          images?: Json | null
          import_license_required?: boolean | null
          is_bestseller?: boolean | null
          is_featured?: boolean | null
          lab_test_reports?: Json | null
          manufacturer_id?: string | null
          manufacturing_date?: string | null
          market_availability?: string | null
          maximum_order_quantity?: number | null
          metadata?: Json | null
          minimum_order_quantity?: number | null
          mixing_instructions?: string | null
          name: string
          nutrient_analysis?: Json | null
          organic_certified?: boolean | null
          origin_country?: string | null
          packaging_options?: Json | null
          pest_targets?: Json | null
          ph_range?: Json | null
          popularity_score?: number | null
          pre_harvest_interval_days?: number | null
          price_per_unit?: number | null
          price_range?: Json | null
          product_type?: string | null
          purity_percentage?: number | null
          quality_certifications?: Json | null
          re_entry_interval_hours?: number | null
          recommended_season?: Json | null
          registration_number?: string | null
          safety_data_sheet_url?: string | null
          safety_level?: string | null
          sales_count?: number | null
          seed_variety_details?: Json | null
          shelf_life_months?: number | null
          sku: string
          spray_volume_per_acre?: Json | null
          status?: string | null
          storage_instructions?: string | null
          storage_temperature_range?: Json | null
          suitable_crops?: Json | null
          suitable_soil_types?: Json | null
          tax_rate?: number | null
          technical_data_sheet_url?: string | null
          translations?: Json | null
          unit_of_measure?: string | null
          updated_at?: string | null
          usage_restrictions?: string | null
          user_reviews_summary?: Json | null
          video_urls?: Json | null
          view_count?: number | null
          warnings?: string | null
          water_solubility?: string | null
          weather_conditions?: Json | null
          weed_targets?: Json | null
        }
        Update: {
          active_ingredients?: Json | null
          ai_metadata?: Json | null
          ai_recommendable?: boolean | null
          application_method?: string | null
          application_timing?: Json | null
          approval_authority?: string | null
          approval_date?: string | null
          approved_at?: string | null
          approved_by?: string | null
          available_pack_sizes?: Json | null
          barcode?: string | null
          batch_number?: string | null
          brand?: string | null
          cas_number?: string | null
          category_id?: string
          company_id?: string
          compatibility_info?: Json | null
          composition?: string | null
          country_of_origin?: string | null
          created_at?: string | null
          created_by?: string | null
          crop_stages?: Json | null
          currency?: string | null
          description?: string | null
          discount_applicable?: boolean | null
          discount_details?: Json | null
          disease_targets?: Json | null
          disposal_instructions?: string | null
          distributor_id?: string | null
          documents?: Json | null
          dosage_instructions?: string | null
          effectiveness_rating?: number | null
          environmental_impact?: Json | null
          expiry_date?: string | null
          first_aid_measures?: string | null
          germination_rate?: number | null
          handling_precautions?: string | null
          hsn_code?: string | null
          id?: string
          images?: Json | null
          import_license_required?: boolean | null
          is_bestseller?: boolean | null
          is_featured?: boolean | null
          lab_test_reports?: Json | null
          manufacturer_id?: string | null
          manufacturing_date?: string | null
          market_availability?: string | null
          maximum_order_quantity?: number | null
          metadata?: Json | null
          minimum_order_quantity?: number | null
          mixing_instructions?: string | null
          name?: string
          nutrient_analysis?: Json | null
          organic_certified?: boolean | null
          origin_country?: string | null
          packaging_options?: Json | null
          pest_targets?: Json | null
          ph_range?: Json | null
          popularity_score?: number | null
          pre_harvest_interval_days?: number | null
          price_per_unit?: number | null
          price_range?: Json | null
          product_type?: string | null
          purity_percentage?: number | null
          quality_certifications?: Json | null
          re_entry_interval_hours?: number | null
          recommended_season?: Json | null
          registration_number?: string | null
          safety_data_sheet_url?: string | null
          safety_level?: string | null
          sales_count?: number | null
          seed_variety_details?: Json | null
          shelf_life_months?: number | null
          sku?: string
          spray_volume_per_acre?: Json | null
          status?: string | null
          storage_instructions?: string | null
          storage_temperature_range?: Json | null
          suitable_crops?: Json | null
          suitable_soil_types?: Json | null
          tax_rate?: number | null
          technical_data_sheet_url?: string | null
          translations?: Json | null
          unit_of_measure?: string | null
          updated_at?: string | null
          usage_restrictions?: string | null
          user_reviews_summary?: Json | null
          video_urls?: Json | null
          view_count?: number | null
          warnings?: string | null
          water_solubility?: string | null
          weather_conditions?: Json | null
          weed_targets?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "master_products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "master_product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "master_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_products_distributor_fkey"
            columns: ["distributor_id"]
            isOneToOne: false
            referencedRelation: "master_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "master_products_manufacturer_fkey"
            columns: ["manufacturer_id"]
            isOneToOne: false
            referencedRelation: "master_companies"
            referencedColumns: ["id"]
          },
        ]
      }
      message_channels: {
        Row: {
          channel_type: string
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_private: boolean | null
          name: string
          organization_id: string
          updated_at: string | null
        }
        Insert: {
          channel_type?: string
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_private?: boolean | null
          name: string
          organization_id: string
          updated_at?: string | null
        }
        Update: {
          channel_type?: string
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_private?: boolean | null
          name?: string
          organization_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      message_translations: {
        Row: {
          created_at: string | null
          id: string
          language_code: string
          message_id: string
          translated_content: string
          translation_provider: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          language_code: string
          message_id: string
          translated_content: string
          translation_provider?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          language_code?: string
          message_id?: string
          translated_content?: string
          translation_provider?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "message_translations_message_id_fkey"
            columns: ["message_id"]
            isOneToOne: false
            referencedRelation: "messages"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: string
          conversation_id: string
          created_at: string | null
          id: string
          is_read: boolean | null
          media_urls: Json | null
          original_language: string | null
          read_at: string | null
          receiver_id: string
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          content: string
          conversation_id: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          media_urls?: Json | null
          original_language?: string | null
          read_at?: string | null
          receiver_id: string
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          content?: string
          conversation_id?: string
          created_at?: string | null
          id?: string
          is_read?: boolean | null
          media_urls?: Json | null
          original_language?: string | null
          read_at?: string | null
          receiver_id?: string
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_receiver_id_fkey"
            columns: ["receiver_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "messages_sender_id_fkey"
            columns: ["sender_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      mgrs_tiles: {
        Row: {
          agri_area_km2: number | null
          country_id: string | null
          created_at: string | null
          district: string | null
          district_id: string | null
          geojson_geometry: Json | null
          geometry: unknown
          id: string
          is_agri: boolean | null
          is_land_contain: boolean | null
          is_ndvi_ready: boolean | null
          last_checked: string | null
          last_land_check: string | null
          last_ndvi_update: string | null
          state: string | null
          state_id: string | null
          taluka_id: string | null
          tile_id: string
          total_area_km2: number | null
          total_lands_count: number | null
          updated_at: string | null
          village_id: string | null
        }
        Insert: {
          agri_area_km2?: number | null
          country_id?: string | null
          created_at?: string | null
          district?: string | null
          district_id?: string | null
          geojson_geometry?: Json | null
          geometry: unknown
          id?: string
          is_agri?: boolean | null
          is_land_contain?: boolean | null
          is_ndvi_ready?: boolean | null
          last_checked?: string | null
          last_land_check?: string | null
          last_ndvi_update?: string | null
          state?: string | null
          state_id?: string | null
          taluka_id?: string | null
          tile_id: string
          total_area_km2?: number | null
          total_lands_count?: number | null
          updated_at?: string | null
          village_id?: string | null
        }
        Update: {
          agri_area_km2?: number | null
          country_id?: string | null
          created_at?: string | null
          district?: string | null
          district_id?: string | null
          geojson_geometry?: Json | null
          geometry?: unknown
          id?: string
          is_agri?: boolean | null
          is_land_contain?: boolean | null
          is_ndvi_ready?: boolean | null
          last_checked?: string | null
          last_land_check?: string | null
          last_ndvi_update?: string | null
          state?: string | null
          state_id?: string | null
          taluka_id?: string | null
          tile_id?: string
          total_area_km2?: number | null
          total_lands_count?: number | null
          updated_at?: string | null
          village_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "mgrs_tiles_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      mgrs_tiles_backup: {
        Row: {
          agri_area_km2: number | null
          country_id: string | null
          created_at: string | null
          district: string | null
          district_id: string | null
          geometry: unknown
          id: string | null
          is_agri: boolean | null
          last_checked: string | null
          last_land_check: string | null
          state: string | null
          state_id: string | null
          taluka_id: string | null
          tile_id: string | null
          total_area_km2: number | null
          total_lands_count: number | null
          updated_at: string | null
          village_id: string | null
        }
        Insert: {
          agri_area_km2?: number | null
          country_id?: string | null
          created_at?: string | null
          district?: string | null
          district_id?: string | null
          geometry?: unknown
          id?: string | null
          is_agri?: boolean | null
          last_checked?: string | null
          last_land_check?: string | null
          state?: string | null
          state_id?: string | null
          taluka_id?: string | null
          tile_id?: string | null
          total_area_km2?: number | null
          total_lands_count?: number | null
          updated_at?: string | null
          village_id?: string | null
        }
        Update: {
          agri_area_km2?: number | null
          country_id?: string | null
          created_at?: string | null
          district?: string | null
          district_id?: string | null
          geometry?: unknown
          id?: string | null
          is_agri?: boolean | null
          last_checked?: string | null
          last_land_check?: string | null
          state?: string | null
          state_id?: string | null
          taluka_id?: string | null
          tile_id?: string | null
          total_area_km2?: number | null
          total_lands_count?: number | null
          updated_at?: string | null
          village_id?: string | null
        }
        Relationships: []
      }
      ndvi_data: {
        Row: {
          cloud_cover: number | null
          cloud_coverage: number | null
          collection_id: string | null
          computed_at: string | null
          confidence_level: string | null
          coverage: number | null
          coverage_percentage: number | null
          created_at: string
          date: string
          evi_value: number | null
          id: string
          image_url: string | null
          land_id: string
          max_ndvi: number | null
          mcari_value: number | null
          mean_ndvi: number | null
          median_ndvi: number | null
          metadata: Json | null
          min_ndvi: number | null
          ndvi_max: number | null
          ndvi_min: number | null
          ndvi_std: number | null
          ndvi_value: number | null
          ndwi_value: number | null
          processing_level: string | null
          quality_score: number | null
          satellite_source: string | null
          savi_value: number | null
          scene_id: string | null
          soil_moisture: number | null
          spatial_resolution: number | null
          tenant_id: string
          tile_id: string | null
          total_pixels: number | null
          updated_at: string | null
          valid_pixels: number | null
        }
        Insert: {
          cloud_cover?: number | null
          cloud_coverage?: number | null
          collection_id?: string | null
          computed_at?: string | null
          confidence_level?: string | null
          coverage?: number | null
          coverage_percentage?: number | null
          created_at?: string
          date: string
          evi_value?: number | null
          id?: string
          image_url?: string | null
          land_id: string
          max_ndvi?: number | null
          mcari_value?: number | null
          mean_ndvi?: number | null
          median_ndvi?: number | null
          metadata?: Json | null
          min_ndvi?: number | null
          ndvi_max?: number | null
          ndvi_min?: number | null
          ndvi_std?: number | null
          ndvi_value?: number | null
          ndwi_value?: number | null
          processing_level?: string | null
          quality_score?: number | null
          satellite_source?: string | null
          savi_value?: number | null
          scene_id?: string | null
          soil_moisture?: number | null
          spatial_resolution?: number | null
          tenant_id: string
          tile_id?: string | null
          total_pixels?: number | null
          updated_at?: string | null
          valid_pixels?: number | null
        }
        Update: {
          cloud_cover?: number | null
          cloud_coverage?: number | null
          collection_id?: string | null
          computed_at?: string | null
          confidence_level?: string | null
          coverage?: number | null
          coverage_percentage?: number | null
          created_at?: string
          date?: string
          evi_value?: number | null
          id?: string
          image_url?: string | null
          land_id?: string
          max_ndvi?: number | null
          mcari_value?: number | null
          mean_ndvi?: number | null
          median_ndvi?: number | null
          metadata?: Json | null
          min_ndvi?: number | null
          ndvi_max?: number | null
          ndvi_min?: number | null
          ndvi_std?: number | null
          ndvi_value?: number | null
          ndwi_value?: number | null
          processing_level?: string | null
          quality_score?: number | null
          satellite_source?: string | null
          savi_value?: number | null
          scene_id?: string | null
          soil_moisture?: number | null
          spatial_resolution?: number | null
          tenant_id?: string
          tile_id?: string | null
          total_pixels?: number | null
          updated_at?: string | null
          valid_pixels?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ndvi_data_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      ndvi_micro_tiles: {
        Row: {
          access_count: number | null
          acquisition_date: string
          bbox: Json
          cloud_cover: number | null
          created_at: string | null
          expires_at: string | null
          farmer_id: string | null
          id: string
          land_id: string | null
          last_accessed_at: string | null
          ndvi_max: number | null
          ndvi_mean: number | null
          ndvi_min: number | null
          ndvi_std_dev: number | null
          ndvi_thumbnail_url: string | null
          processing_units_used: number | null
          resolution_meters: number | null
          statistics_only: boolean | null
          tenant_id: string | null
          thumbnail_size_kb: number | null
        }
        Insert: {
          access_count?: number | null
          acquisition_date: string
          bbox: Json
          cloud_cover?: number | null
          created_at?: string | null
          expires_at?: string | null
          farmer_id?: string | null
          id?: string
          land_id?: string | null
          last_accessed_at?: string | null
          ndvi_max?: number | null
          ndvi_mean?: number | null
          ndvi_min?: number | null
          ndvi_std_dev?: number | null
          ndvi_thumbnail_url?: string | null
          processing_units_used?: number | null
          resolution_meters?: number | null
          statistics_only?: boolean | null
          tenant_id?: string | null
          thumbnail_size_kb?: number | null
        }
        Update: {
          access_count?: number | null
          acquisition_date?: string
          bbox?: Json
          cloud_cover?: number | null
          created_at?: string | null
          expires_at?: string | null
          farmer_id?: string | null
          id?: string
          land_id?: string | null
          last_accessed_at?: string | null
          ndvi_max?: number | null
          ndvi_mean?: number | null
          ndvi_min?: number | null
          ndvi_std_dev?: number | null
          ndvi_thumbnail_url?: string | null
          processing_units_used?: number | null
          resolution_meters?: number | null
          statistics_only?: boolean | null
          tenant_id?: string | null
          thumbnail_size_kb?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "ndvi_micro_tiles_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_micro_tiles_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ndvi_processing_logs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          duration_ms: number | null
          error_details: Json | null
          error_message: string | null
          id: string
          land_id: string | null
          metadata: Json | null
          processing_step: string
          satellite_tile_id: string | null
          started_at: string | null
          step_status: string
          tenant_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          land_id?: string | null
          metadata?: Json | null
          processing_step: string
          satellite_tile_id?: string | null
          started_at?: string | null
          step_status: string
          tenant_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          duration_ms?: number | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          land_id?: string | null
          metadata?: Json | null
          processing_step?: string
          satellite_tile_id?: string | null
          started_at?: string | null
          step_status?: string
          tenant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ndvi_processing_logs_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_processing_logs_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "ndvi_processing_logs_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "ndvi_processing_logs_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_processing_logs_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_processing_logs_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_processing_logs_satellite_tile_id_fkey"
            columns: ["satellite_tile_id"]
            isOneToOne: false
            referencedRelation: "satellite_tiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_processing_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ndvi_request_queue: {
        Row: {
          batch_size: number | null
          completed_at: string | null
          created_at: string | null
          error_message: string | null
          failed_count: number | null
          farmer_id: string | null
          id: string
          land_ids: string[]
          last_error: string | null
          metadata: Json | null
          priority: number | null
          processed_count: number | null
          processing_duration_ms: number | null
          processing_units_consumed: number | null
          requested_at: string | null
          retry_count: number | null
          scheduled_for: string | null
          started_at: string | null
          statistics_only: boolean | null
          status: string | null
          tenant_id: string | null
          tile_id: string
        }
        Insert: {
          batch_size?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_count?: number | null
          farmer_id?: string | null
          id?: string
          land_ids: string[]
          last_error?: string | null
          metadata?: Json | null
          priority?: number | null
          processed_count?: number | null
          processing_duration_ms?: number | null
          processing_units_consumed?: number | null
          requested_at?: string | null
          retry_count?: number | null
          scheduled_for?: string | null
          started_at?: string | null
          statistics_only?: boolean | null
          status?: string | null
          tenant_id?: string | null
          tile_id: string
        }
        Update: {
          batch_size?: number | null
          completed_at?: string | null
          created_at?: string | null
          error_message?: string | null
          failed_count?: number | null
          farmer_id?: string | null
          id?: string
          land_ids?: string[]
          last_error?: string | null
          metadata?: Json | null
          priority?: number | null
          processed_count?: number | null
          processing_duration_ms?: number | null
          processing_units_consumed?: number | null
          requested_at?: string | null
          retry_count?: number | null
          scheduled_for?: string | null
          started_at?: string | null
          statistics_only?: boolean | null
          status?: string | null
          tenant_id?: string | null
          tile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "ndvi_request_queue_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      ndvi_spatial_analytics: {
        Row: {
          anomaly_detection: Json | null
          bbox: Json
          created_at: string | null
          geom: unknown
          id: string
          ndvi_histogram: Json | null
          processed_at: string | null
          quality_flags: Json | null
          region_name: string
          satellite_tile_id: string
          temporal_comparison: Json | null
          updated_at: string | null
          vegetation_zones: Json | null
        }
        Insert: {
          anomaly_detection?: Json | null
          bbox: Json
          created_at?: string | null
          geom?: unknown
          id?: string
          ndvi_histogram?: Json | null
          processed_at?: string | null
          quality_flags?: Json | null
          region_name: string
          satellite_tile_id: string
          temporal_comparison?: Json | null
          updated_at?: string | null
          vegetation_zones?: Json | null
        }
        Update: {
          anomaly_detection?: Json | null
          bbox?: Json
          created_at?: string | null
          geom?: unknown
          id?: string
          ndvi_histogram?: Json | null
          processed_at?: string | null
          quality_flags?: Json | null
          region_name?: string
          satellite_tile_id?: string
          temporal_comparison?: Json | null
          updated_at?: string | null
          vegetation_zones?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "ndvi_spatial_analytics_satellite_tile_id_fkey"
            columns: ["satellite_tile_id"]
            isOneToOne: false
            referencedRelation: "satellite_tiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_preferences: {
        Row: {
          created_at: string | null
          email_notifications: Json | null
          id: string
          in_app_notifications: Json | null
          notification_schedule: Json | null
          push_notifications: Json | null
          sms_notifications: Json | null
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email_notifications?: Json | null
          id?: string
          in_app_notifications?: Json | null
          notification_schedule?: Json | null
          push_notifications?: Json | null
          sms_notifications?: Json | null
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email_notifications?: Json | null
          id?: string
          in_app_notifications?: Json | null
          notification_schedule?: Json | null
          push_notifications?: Json | null
          sms_notifications?: Json | null
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_preferences_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      offline_sync_queue: {
        Row: {
          action_type: string
          created_at: string | null
          farmer_id: string
          id: string
          payload: Json
          synced: boolean | null
          synced_at: string | null
        }
        Insert: {
          action_type: string
          created_at?: string | null
          farmer_id: string
          id?: string
          payload: Json
          synced?: boolean | null
          synced_at?: string | null
        }
        Update: {
          action_type?: string
          created_at?: string | null
          farmer_id?: string
          id?: string
          payload?: Json
          synced?: boolean | null
          synced_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "offline_sync_queue_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "offline_sync_queue_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      onboarding_step_templates: {
        Row: {
          created_at: string | null
          default_data: Json
          help_text: string | null
          id: string
          is_required: boolean
          step_name: string
          step_number: number
          updated_at: string | null
          validation_schema: Json | null
          version: number
        }
        Insert: {
          created_at?: string | null
          default_data?: Json
          help_text?: string | null
          id?: string
          is_required?: boolean
          step_name: string
          step_number: number
          updated_at?: string | null
          validation_schema?: Json | null
          version?: number
        }
        Update: {
          created_at?: string | null
          default_data?: Json
          help_text?: string | null
          id?: string
          is_required?: boolean
          step_name?: string
          step_number?: number
          updated_at?: string | null
          validation_schema?: Json | null
          version?: number
        }
        Relationships: []
      }
      onboarding_steps: {
        Row: {
          completed_at: string | null
          created_at: string | null
          id: string
          step_data: Json | null
          step_name: string
          step_number: number
          step_status:
            | Database["public"]["Enums"]["onboarding_step_status"]
            | null
          updated_at: string | null
          validation_errors: Json | null
          workflow_id: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          step_data?: Json | null
          step_name: string
          step_number: number
          step_status?:
            | Database["public"]["Enums"]["onboarding_step_status"]
            | null
          updated_at?: string | null
          validation_errors?: Json | null
          workflow_id?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          id?: string
          step_data?: Json | null
          step_name?: string
          step_number?: number
          step_status?:
            | Database["public"]["Enums"]["onboarding_step_status"]
            | null
          updated_at?: string | null
          validation_errors?: Json | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_steps_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      onboarding_workflows: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_step: number | null
          id: string
          metadata: Json | null
          started_at: string | null
          status: string | null
          tenant_id: string | null
          total_steps: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_step?: number | null
          id?: string
          metadata?: Json | null
          started_at?: string | null
          status?: string | null
          tenant_id?: string | null
          total_steps?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "onboarding_workflows_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      orchestrator_metrics: {
        Row: {
          agent_performance: Json | null
          created_at: string | null
          error_message: string | null
          error_type: string | null
          escalation_triggered: boolean | null
          final_confidence: number | null
          id: string
          phase_timings: Json | null
          rules_applied_count: number | null
          safety_status: string | null
          session_id: string | null
          success: boolean | null
          tenant_id: string | null
          total_processing_time_ms: number | null
        }
        Insert: {
          agent_performance?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          escalation_triggered?: boolean | null
          final_confidence?: number | null
          id?: string
          phase_timings?: Json | null
          rules_applied_count?: number | null
          safety_status?: string | null
          session_id?: string | null
          success?: boolean | null
          tenant_id?: string | null
          total_processing_time_ms?: number | null
        }
        Update: {
          agent_performance?: Json | null
          created_at?: string | null
          error_message?: string | null
          error_type?: string | null
          escalation_triggered?: boolean | null
          final_confidence?: number | null
          id?: string
          phase_timings?: Json | null
          rules_applied_count?: number | null
          safety_status?: string | null
          session_id?: string | null
          success?: boolean | null
          tenant_id?: string | null
          total_processing_time_ms?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "orchestrator_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_deliveries: {
        Row: {
          actual_delivery_date: string | null
          courier_name: string | null
          created_at: string
          dealer_id: string | null
          delivered_to: string | null
          delivery_method: string
          delivery_notes: string | null
          delivery_status: string
          expected_delivery_date: string | null
          farmer_id: string
          id: string
          order_id: string
          signature_url: string | null
          tenant_id: string
          tracking_number: string | null
          updated_at: string
        }
        Insert: {
          actual_delivery_date?: string | null
          courier_name?: string | null
          created_at?: string
          dealer_id?: string | null
          delivered_to?: string | null
          delivery_method: string
          delivery_notes?: string | null
          delivery_status?: string
          expected_delivery_date?: string | null
          farmer_id: string
          id?: string
          order_id: string
          signature_url?: string | null
          tenant_id: string
          tracking_number?: string | null
          updated_at?: string
        }
        Update: {
          actual_delivery_date?: string | null
          courier_name?: string | null
          created_at?: string
          dealer_id?: string | null
          delivered_to?: string | null
          delivery_method?: string
          delivery_notes?: string | null
          delivery_status?: string
          expected_delivery_date?: string | null
          farmer_id?: string
          id?: string
          order_id?: string
          signature_url?: string | null
          tenant_id?: string
          tracking_number?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_deliveries_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_deliveries_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_deliveries_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "order_deliveries_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_deliveries_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_fulfillment: {
        Row: {
          assigned_to: string | null
          created_at: string
          dealer_id: string | null
          delivered_at: string | null
          fulfillment_status: string
          id: string
          order_id: string
          packed_at: string | null
          packing_notes: string | null
          shipped_at: string | null
          tenant_id: string
          updated_at: string
          warehouse_location: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          dealer_id?: string | null
          delivered_at?: string | null
          fulfillment_status?: string
          id?: string
          order_id: string
          packed_at?: string | null
          packing_notes?: string | null
          shipped_at?: string | null
          tenant_id: string
          updated_at?: string
          warehouse_location?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          dealer_id?: string | null
          delivered_at?: string | null
          fulfillment_status?: string
          id?: string
          order_id?: string
          packed_at?: string | null
          packing_notes?: string | null
          shipped_at?: string | null
          tenant_id?: string
          updated_at?: string
          warehouse_location?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "order_fulfillment_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_fulfillment_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          created_at: string | null
          farmer_id: string | null
          id: string
          order_id: string | null
          product_id: string | null
          quantity: number
          tenant_id: string | null
          total_price: number
          unit_price: number
        }
        Insert: {
          created_at?: string | null
          farmer_id?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity: number
          tenant_id?: string | null
          total_price: number
          unit_price: number
        }
        Update: {
          created_at?: string | null
          farmer_id?: string | null
          id?: string
          order_id?: string | null
          product_id?: string | null
          quantity?: number
          tenant_id?: string | null
          total_price?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "order_items_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "marketplace_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_analytics: {
        Row: {
          active_dealers: number | null
          active_farmers: number | null
          active_products: number | null
          api_calls_today: number | null
          calculated_at: string
          created_at: string
          engagement_rate: number | null
          id: string
          last_activity_at: string | null
          revenue_impact: number | null
          storage_used_mb: number | null
          tenant_id: string
          total_campaigns: number | null
          total_dealers: number | null
          total_farmers: number | null
          total_products: number | null
          updated_at: string
        }
        Insert: {
          active_dealers?: number | null
          active_farmers?: number | null
          active_products?: number | null
          api_calls_today?: number | null
          calculated_at?: string
          created_at?: string
          engagement_rate?: number | null
          id?: string
          last_activity_at?: string | null
          revenue_impact?: number | null
          storage_used_mb?: number | null
          tenant_id: string
          total_campaigns?: number | null
          total_dealers?: number | null
          total_farmers?: number | null
          total_products?: number | null
          updated_at?: string
        }
        Update: {
          active_dealers?: number | null
          active_farmers?: number | null
          active_products?: number | null
          api_calls_today?: number | null
          calculated_at?: string
          created_at?: string
          engagement_rate?: number | null
          id?: string
          last_activity_at?: string | null
          revenue_impact?: number | null
          storage_used_mb?: number | null
          tenant_id?: string
          total_campaigns?: number | null
          total_dealers?: number | null
          total_farmers?: number | null
          total_products?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          joined_at: string | null
          organization_id: string
          permissions: Json | null
          role: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          organization_id: string
          permissions?: Json | null
          role?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          joined_at?: string | null
          organization_id?: string
          permissions?: Json | null
          role?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      organization_settings: {
        Row: {
          business_hours: Json | null
          compliance_settings: Json | null
          contact_info: Json | null
          created_at: string | null
          custom_fields: Json | null
          id: string
          social_links: Json | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          business_hours?: Json | null
          compliance_settings?: Json | null
          contact_info?: Json | null
          created_at?: string | null
          custom_fields?: Json | null
          id?: string
          social_links?: Json | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          business_hours?: Json | null
          compliance_settings?: Json | null
          contact_info?: Json | null
          created_at?: string | null
          custom_fields?: Json | null
          id?: string
          social_links?: Json | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_weather_alerts: {
        Row: {
          acknowledged_by: Json | null
          affected_areas: Json
          alert_type: string
          created_at: string | null
          description: string
          expires_at: string | null
          id: string
          is_active: boolean | null
          organization_id: string
          recommendations: Json | null
          severity: string
          title: string
          updated_at: string | null
        }
        Insert: {
          acknowledged_by?: Json | null
          affected_areas: Json
          alert_type: string
          created_at?: string | null
          description: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id: string
          recommendations?: Json | null
          severity: string
          title: string
          updated_at?: string | null
        }
        Update: {
          acknowledged_by?: Json | null
          affected_areas?: Json
          alert_type?: string
          created_at?: string | null
          description?: string
          expires_at?: string | null
          id?: string
          is_active?: boolean | null
          organization_id?: string
          recommendations?: Json | null
          severity?: string
          title?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      otp_sessions: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string | null
          id: string
          is_used: boolean | null
          otp: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at?: string | null
          id?: string
          is_used?: boolean | null
          otp: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string | null
          id?: string
          is_used?: boolean | null
          otp?: string
          user_id?: string
        }
        Relationships: []
      }
      password_history: {
        Row: {
          created_at: string | null
          id: string
          password_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          password_hash: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          password_hash?: string
          user_id?: string
        }
        Relationships: []
      }
      password_reset_requests: {
        Row: {
          created_at: string | null
          email: string
          expires_at: string
          id: string
          is_used: boolean | null
          reset_token: string
          updated_at: string | null
          used_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          email: string
          expires_at: string
          id?: string
          is_used?: boolean | null
          reset_token: string
          updated_at?: string | null
          used_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          email?: string
          expires_at?: string
          id?: string
          is_used?: boolean | null
          reset_token?: string
          updated_at?: string | null
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      payment_intents: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          dummy_payment_data: Json | null
          error_message: string | null
          expires_at: string | null
          farmer_id: string | null
          id: string
          payment_method: string | null
          plan_id: string
          status: string | null
          subscription_type: string
          tenant_id: string | null
          transaction_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          dummy_payment_data?: Json | null
          error_message?: string | null
          expires_at?: string | null
          farmer_id?: string | null
          id?: string
          payment_method?: string | null
          plan_id: string
          status?: string | null
          subscription_type: string
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          dummy_payment_data?: Json | null
          error_message?: string | null
          expires_at?: string | null
          farmer_id?: string | null
          id?: string
          payment_method?: string | null
          plan_id?: string
          status?: string | null
          subscription_type?: string
          tenant_id?: string | null
          transaction_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "payment_intents_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_methods: {
        Row: {
          account_last4: string | null
          bank_name: string | null
          card_brand: string | null
          card_exp_month: number | null
          card_exp_year: number | null
          card_last4: string | null
          created_at: string
          farmer_id: string | null
          id: string
          is_active: boolean | null
          is_default: boolean | null
          is_verified: boolean | null
          metadata: Json | null
          provider: string
          stripe_payment_method_id: string | null
          tenant_id: string | null
          type: string
          updated_at: string
          upi_id: string | null
        }
        Insert: {
          account_last4?: string | null
          bank_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string
          farmer_id?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_verified?: boolean | null
          metadata?: Json | null
          provider?: string
          stripe_payment_method_id?: string | null
          tenant_id?: string | null
          type: string
          updated_at?: string
          upi_id?: string | null
        }
        Update: {
          account_last4?: string | null
          bank_name?: string | null
          card_brand?: string | null
          card_exp_month?: number | null
          card_exp_year?: number | null
          card_last4?: string | null
          created_at?: string
          farmer_id?: string | null
          id?: string
          is_active?: boolean | null
          is_default?: boolean | null
          is_verified?: boolean | null
          metadata?: Json | null
          provider?: string
          stripe_payment_method_id?: string | null
          tenant_id?: string | null
          type?: string
          updated_at?: string
          upi_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_methods_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_records: {
        Row: {
          amount: number
          created_at: string
          currency: string
          gateway_response: Json | null
          id: string
          invoice_id: string | null
          payment_method: string | null
          processed_at: string | null
          status: string
          tenant_id: string
          transaction_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          gateway_response?: Json | null
          id?: string
          invoice_id?: string | null
          payment_method?: string | null
          processed_at?: string | null
          status?: string
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          gateway_response?: Json | null
          id?: string
          invoice_id?: string | null
          payment_method?: string | null
          processed_at?: string | null
          status?: string
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_records_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_records_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_retry_logs: {
        Row: {
          created_at: string | null
          failure_reason: string | null
          gateway_response: Json | null
          id: string
          next_retry_at: string | null
          payment_id: string | null
          retry_attempt: number
          retry_status: string | null
        }
        Insert: {
          created_at?: string | null
          failure_reason?: string | null
          gateway_response?: Json | null
          id?: string
          next_retry_at?: string | null
          payment_id?: string | null
          retry_attempt: number
          retry_status?: string | null
        }
        Update: {
          created_at?: string | null
          failure_reason?: string | null
          gateway_response?: Json | null
          id?: string
          next_retry_at?: string | null
          payment_id?: string | null
          retry_attempt?: number
          retry_status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payment_retry_logs_payment_id_fkey"
            columns: ["payment_id"]
            isOneToOne: false
            referencedRelation: "payment_records"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_transactions: {
        Row: {
          amount: number
          created_at: string
          currency: string
          failure_code: string | null
          failure_message: string | null
          farmer_id: string | null
          id: string
          invoice_id: string | null
          metadata: Json | null
          payment_method_id: string | null
          processed_at: string | null
          status: string
          stripe_charge_id: string | null
          stripe_payment_intent_id: string | null
          stripe_refund_id: string | null
          subscription_id: string | null
          tenant_id: string | null
          type: string
        }
        Insert: {
          amount: number
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_message?: string | null
          farmer_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payment_method_id?: string | null
          processed_at?: string | null
          status: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subscription_id?: string | null
          tenant_id?: string | null
          type: string
        }
        Update: {
          amount?: number
          created_at?: string
          currency?: string
          failure_code?: string | null
          failure_message?: string | null
          farmer_id?: string | null
          id?: string
          invoice_id?: string | null
          metadata?: Json | null
          payment_method_id?: string | null
          processed_at?: string | null
          status?: string
          stripe_charge_id?: string | null
          stripe_payment_intent_id?: string | null
          stripe_refund_id?: string | null
          subscription_id?: string | null
          tenant_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_transactions_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_payment_method_id_fkey"
            columns: ["payment_method_id"]
            isOneToOne: false
            referencedRelation: "payment_methods"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string | null
          currency: string | null
          due_date: string | null
          gateway_response: Json | null
          id: string
          invoice_number: string | null
          metadata: Json | null
          payment_date: string | null
          payment_method: Json | null
          payment_status: string | null
          subscription_id: string | null
          tenant_id: string
          transaction_id: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          gateway_response?: Json | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          payment_date?: string | null
          payment_method?: Json | null
          payment_status?: string | null
          subscription_id?: string | null
          tenant_id: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          created_at?: string | null
          currency?: string | null
          due_date?: string | null
          gateway_response?: Json | null
          id?: string
          invoice_number?: string | null
          metadata?: Json | null
          payment_date?: string | null
          payment_method?: Json | null
          payment_status?: string | null
          subscription_id?: string | null
          tenant_id?: string
          transaction_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payments_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      payouts: {
        Row: {
          amount: number
          archived: boolean | null
          commission_rate: number | null
          created_at: string | null
          currency: string | null
          failed_at: string | null
          failure_reason: string | null
          gateway_response: Json | null
          id: string
          metadata: Json | null
          payout_method: string | null
          processed_at: string | null
          status: string | null
          tenant_id: string
          transaction_id: string | null
          transfer_ref: string | null
          updated_at: string | null
        }
        Insert: {
          amount: number
          archived?: boolean | null
          commission_rate?: number | null
          created_at?: string | null
          currency?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          gateway_response?: Json | null
          id?: string
          metadata?: Json | null
          payout_method?: string | null
          processed_at?: string | null
          status?: string | null
          tenant_id: string
          transaction_id?: string | null
          transfer_ref?: string | null
          updated_at?: string | null
        }
        Update: {
          amount?: number
          archived?: boolean | null
          commission_rate?: number | null
          created_at?: string | null
          currency?: string | null
          failed_at?: string | null
          failure_reason?: string | null
          gateway_response?: Json | null
          id?: string
          metadata?: Json | null
          payout_method?: string | null
          processed_at?: string | null
          status?: string | null
          tenant_id?: string
          transaction_id?: string | null
          transfer_ref?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      pending_admin_requests: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          email: string
          expires_at: string
          full_name: string
          id: string
          metadata: Json | null
          password_hash: string
          rejection_reason: string | null
          request_token: string
          requested_at: string
          status: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          email: string
          expires_at?: string
          full_name: string
          id?: string
          metadata?: Json | null
          password_hash: string
          rejection_reason?: string | null
          request_token?: string
          requested_at?: string
          status?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          email?: string
          expires_at?: string
          full_name?: string
          id?: string
          metadata?: Json | null
          password_hash?: string
          rejection_reason?: string | null
          request_token?: string
          requested_at?: string
          status?: string
        }
        Relationships: []
      }
      plans: {
        Row: {
          archived: boolean | null
          created_at: string | null
          currency: string | null
          description: string | null
          duration_days: number
          features: Json | null
          id: string
          is_active: boolean | null
          is_global: boolean | null
          limits: Json | null
          plan_type: string | null
          price: number
          sort_order: number | null
          tenant_id: string | null
          title: string
          updated_at: string | null
        }
        Insert: {
          archived?: boolean | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_days?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          limits?: Json | null
          plan_type?: string | null
          price: number
          sort_order?: number | null
          tenant_id?: string | null
          title: string
          updated_at?: string | null
        }
        Update: {
          archived?: boolean | null
          created_at?: string | null
          currency?: string | null
          description?: string | null
          duration_days?: number
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_global?: boolean | null
          limits?: Json | null
          plan_type?: string | null
          price?: number
          sort_order?: number | null
          tenant_id?: string | null
          title?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_alerts: {
        Row: {
          acknowledged_at: string | null
          acknowledged_by: string | null
          alert_name: string
          created_at: string | null
          current_value: number | null
          description: string | null
          id: string
          metadata: Json | null
          metric_name: string | null
          resolved_at: string | null
          resolved_by: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status: Database["public"]["Enums"]["alert_status"] | null
          tenant_id: string | null
          threshold_value: number | null
          triggered_at: string | null
          updated_at: string | null
        }
        Insert: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_name: string
          created_at?: string | null
          current_value?: number | null
          description?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"] | null
          tenant_id?: string | null
          threshold_value?: number | null
          triggered_at?: string | null
          updated_at?: string | null
        }
        Update: {
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          alert_name?: string
          created_at?: string | null
          current_value?: number | null
          description?: string | null
          id?: string
          metadata?: Json | null
          metric_name?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: Database["public"]["Enums"]["alert_severity"]
          status?: Database["public"]["Enums"]["alert_status"] | null
          tenant_id?: string | null
          threshold_value?: number | null
          triggered_at?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "platform_alerts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_notifications: {
        Row: {
          created_at: string | null
          data: Json | null
          expires_at: string | null
          id: string
          is_read: boolean | null
          message: string
          severity: string
          tenant_id: string | null
          title: string
          type: string
        }
        Insert: {
          created_at?: string | null
          data?: Json | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message: string
          severity?: string
          tenant_id?: string | null
          title: string
          type: string
        }
        Update: {
          created_at?: string | null
          data?: Json | null
          expires_at?: string | null
          id?: string
          is_read?: boolean | null
          message?: string
          severity?: string
          tenant_id?: string | null
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "platform_notifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      poll_votes: {
        Row: {
          farmer_id: string
          id: string
          option_ids: Json
          poll_id: string
          voted_at: string | null
        }
        Insert: {
          farmer_id: string
          id?: string
          option_ids: Json
          poll_id: string
          voted_at?: string | null
        }
        Update: {
          farmer_id?: string
          id?: string
          option_ids?: Json
          poll_id?: string
          voted_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "poll_votes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "poll_votes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "poll_votes_poll_id_fkey"
            columns: ["poll_id"]
            isOneToOne: false
            referencedRelation: "post_polls"
            referencedColumns: ["id"]
          },
        ]
      }
      post_comments: {
        Row: {
          content: string
          created_at: string | null
          farmer_id: string
          id: string
          is_expert_comment: boolean | null
          language_code: string | null
          likes_count: number | null
          parent_comment_id: string | null
          post_id: string
          translations: Json | null
          updated_at: string | null
        }
        Insert: {
          content: string
          created_at?: string | null
          farmer_id: string
          id?: string
          is_expert_comment?: boolean | null
          language_code?: string | null
          likes_count?: number | null
          parent_comment_id?: string | null
          post_id: string
          translations?: Json | null
          updated_at?: string | null
        }
        Update: {
          content?: string
          created_at?: string | null
          farmer_id?: string
          id?: string
          is_expert_comment?: boolean | null
          language_code?: string | null
          likes_count?: number | null
          parent_comment_id?: string | null
          post_id?: string
          translations?: Json | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_comments_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "post_comments_parent_comment_id_fkey"
            columns: ["parent_comment_id"]
            isOneToOne: false
            referencedRelation: "post_comments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_comments_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_interactions: {
        Row: {
          created_at: string | null
          farmer_id: string
          id: string
          interaction_type: string
          post_id: string
        }
        Insert: {
          created_at?: string | null
          farmer_id: string
          id?: string
          interaction_type: string
          post_id: string
        }
        Update: {
          created_at?: string | null
          farmer_id?: string
          id?: string
          interaction_type?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_interactions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_interactions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "post_interactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_likes: {
        Row: {
          created_at: string | null
          farmer_id: string
          id: string
          post_id: string
        }
        Insert: {
          created_at?: string | null
          farmer_id: string
          id?: string
          post_id: string
        }
        Update: {
          created_at?: string | null
          farmer_id?: string
          id?: string
          post_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_likes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_likes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "post_likes_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_polls: {
        Row: {
          allow_multiple: boolean | null
          created_at: string | null
          end_date: string | null
          id: string
          is_anonymous: boolean | null
          options: Json
          post_id: string
          question: string
        }
        Insert: {
          allow_multiple?: boolean | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_anonymous?: boolean | null
          options: Json
          post_id: string
          question: string
        }
        Update: {
          allow_multiple?: boolean | null
          created_at?: string | null
          end_date?: string | null
          id?: string
          is_anonymous?: boolean | null
          options?: Json
          post_id?: string
          question?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_polls_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_reactions: {
        Row: {
          created_at: string
          farmer_id: string
          id: string
          post_id: string
          reaction_type: string
        }
        Insert: {
          created_at?: string
          farmer_id: string
          id?: string
          post_id: string
          reaction_type: string
        }
        Update: {
          created_at?: string
          farmer_id?: string
          id?: string
          post_id?: string
          reaction_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "post_reactions_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_saves: {
        Row: {
          farmer_id: string
          folder: string | null
          id: string
          post_id: string
          saved_at: string | null
        }
        Insert: {
          farmer_id: string
          folder?: string | null
          id?: string
          post_id: string
          saved_at?: string | null
        }
        Update: {
          farmer_id?: string
          folder?: string | null
          id?: string
          post_id?: string
          saved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_saves_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_saves_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "post_saves_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
        ]
      }
      post_shares: {
        Row: {
          farmer_id: string
          id: string
          post_id: string
          share_message: string | null
          share_type: string | null
          shared_at: string | null
          shared_to_community_id: string | null
        }
        Insert: {
          farmer_id: string
          id?: string
          post_id: string
          share_message?: string | null
          share_type?: string | null
          shared_at?: string | null
          shared_to_community_id?: string | null
        }
        Update: {
          farmer_id?: string
          id?: string
          post_id?: string
          share_message?: string | null
          share_type?: string | null
          shared_at?: string | null
          shared_to_community_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "post_shares_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "post_shares_post_id_fkey"
            columns: ["post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "post_shares_shared_to_community_id_fkey"
            columns: ["shared_to_community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
        ]
      }
      posts: {
        Row: {
          comments_count: number | null
          community_id: string | null
          content: string
          created_at: string | null
          farmer_id: string
          id: string
          is_pinned: boolean | null
          likes_count: number | null
          post_type: string | null
          shares_count: number | null
          updated_at: string | null
        }
        Insert: {
          comments_count?: number | null
          community_id?: string | null
          content: string
          created_at?: string | null
          farmer_id: string
          id?: string
          is_pinned?: boolean | null
          likes_count?: number | null
          post_type?: string | null
          shares_count?: number | null
          updated_at?: string | null
        }
        Update: {
          comments_count?: number | null
          community_id?: string | null
          content?: string
          created_at?: string | null
          farmer_id?: string
          id?: string
          is_pinned?: boolean | null
          likes_count?: number | null
          post_type?: string | null
          shares_count?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "posts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      predictive_analytics: {
        Row: {
          actual_value: number | null
          confidence_score: number | null
          created_at: string
          id: string
          input_features: Json | null
          model_type: string
          model_version: string | null
          predicted_value: number | null
          prediction_date: string
          prediction_horizon: number
          prediction_metadata: Json | null
          target_entity_id: string | null
          target_entity_type: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          actual_value?: number | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          input_features?: Json | null
          model_type: string
          model_version?: string | null
          predicted_value?: number | null
          prediction_date: string
          prediction_horizon: number
          prediction_metadata?: Json | null
          target_entity_id?: string | null
          target_entity_type: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          actual_value?: number | null
          confidence_score?: number | null
          created_at?: string
          id?: string
          input_features?: Json | null
          model_type?: string
          model_version?: string | null
          predicted_value?: number | null
          prediction_date?: string
          prediction_horizon?: number
          prediction_metadata?: Json | null
          target_entity_id?: string | null
          target_entity_type?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_predictive_analytics_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      prescription_maps: {
        Row: {
          application_method: string | null
          applied_date: string | null
          created_at: string | null
          created_date: string
          crop_name: string | null
          estimated_cost: number | null
          farmer_id: string
          growth_stage: string | null
          id: string
          land_id: string
          map_data: Json
          map_type: string
          status: string | null
          tenant_id: string
          total_area_acres: number | null
          updated_at: string | null
          zones: Json
        }
        Insert: {
          application_method?: string | null
          applied_date?: string | null
          created_at?: string | null
          created_date: string
          crop_name?: string | null
          estimated_cost?: number | null
          farmer_id: string
          growth_stage?: string | null
          id?: string
          land_id: string
          map_data: Json
          map_type: string
          status?: string | null
          tenant_id: string
          total_area_acres?: number | null
          updated_at?: string | null
          zones: Json
        }
        Update: {
          application_method?: string | null
          applied_date?: string | null
          created_at?: string | null
          created_date?: string
          crop_name?: string | null
          estimated_cost?: number | null
          farmer_id?: string
          growth_stage?: string | null
          id?: string
          land_id?: string
          map_data?: Json
          map_type?: string
          status?: string | null
          tenant_id?: string
          total_area_acres?: number | null
          updated_at?: string | null
          zones?: Json
        }
        Relationships: [
          {
            foreignKeyName: "fk_prescription_maps_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_maps_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "prescription_maps_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "prescription_maps_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "prescription_maps_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "prescription_maps_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "prescription_maps_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      pricing_models: {
        Row: {
          base_price: number | null
          billing_interval: string | null
          created_at: string | null
          currency: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          model_name: string
          model_type: string
          tenant_id: string | null
          tier_config: Json | null
          updated_at: string | null
          usage_metrics: Json | null
          volume_discounts: Json | null
        }
        Insert: {
          base_price?: number | null
          billing_interval?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          model_name: string
          model_type: string
          tenant_id?: string | null
          tier_config?: Json | null
          updated_at?: string | null
          usage_metrics?: Json | null
          volume_discounts?: Json | null
        }
        Update: {
          base_price?: number | null
          billing_interval?: string | null
          created_at?: string | null
          currency?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          model_name?: string
          model_type?: string
          tenant_id?: string | null
          tier_config?: Json | null
          updated_at?: string | null
          usage_metrics?: Json | null
          volume_discounts?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "pricing_models_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      produce_listings: {
        Row: {
          available_until: string | null
          category_id: string | null
          created_at: string
          crop_name: string
          description: string | null
          farmer_id: string
          harvest_date: string | null
          id: string
          images: string[] | null
          is_organic: boolean | null
          location_details: Json | null
          minimum_order: number | null
          payment_options: string[] | null
          pickup_options: string[] | null
          price_per_unit: number
          quality_grade: string | null
          quantity_available: number
          status: string | null
          storage_type: string | null
          tenant_id: string
          unit_type: string | null
          updated_at: string
          variety: string | null
        }
        Insert: {
          available_until?: string | null
          category_id?: string | null
          created_at?: string
          crop_name: string
          description?: string | null
          farmer_id: string
          harvest_date?: string | null
          id?: string
          images?: string[] | null
          is_organic?: boolean | null
          location_details?: Json | null
          minimum_order?: number | null
          payment_options?: string[] | null
          pickup_options?: string[] | null
          price_per_unit: number
          quality_grade?: string | null
          quantity_available: number
          status?: string | null
          storage_type?: string | null
          tenant_id: string
          unit_type?: string | null
          updated_at?: string
          variety?: string | null
        }
        Update: {
          available_until?: string | null
          category_id?: string | null
          created_at?: string
          crop_name?: string
          description?: string | null
          farmer_id?: string
          harvest_date?: string | null
          id?: string
          images?: string[] | null
          is_organic?: boolean | null
          location_details?: Json | null
          minimum_order?: number | null
          payment_options?: string[] | null
          pickup_options?: string[] | null
          price_per_unit?: number
          quality_grade?: string | null
          quantity_available?: number
          status?: string | null
          storage_type?: string | null
          tenant_id?: string
          unit_type?: string | null
          updated_at?: string
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "produce_listings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_analytics: {
        Row: {
          average_order_value: number | null
          competitive_metrics: Json | null
          conversion_rate: number | null
          created_at: string
          geographic_performance: Json | null
          id: string
          inquiries_count: number | null
          inventory_turnover: number | null
          orders_count: number | null
          period_end: string
          period_start: string
          product_id: string
          profit_margin: number | null
          revenue: number | null
          seasonal_trends: Json | null
          tenant_id: string
          time_period: string
          updated_at: string
          views_count: number | null
        }
        Insert: {
          average_order_value?: number | null
          competitive_metrics?: Json | null
          conversion_rate?: number | null
          created_at?: string
          geographic_performance?: Json | null
          id?: string
          inquiries_count?: number | null
          inventory_turnover?: number | null
          orders_count?: number | null
          period_end: string
          period_start: string
          product_id: string
          profit_margin?: number | null
          revenue?: number | null
          seasonal_trends?: Json | null
          tenant_id: string
          time_period: string
          updated_at?: string
          views_count?: number | null
        }
        Update: {
          average_order_value?: number | null
          competitive_metrics?: Json | null
          conversion_rate?: number | null
          created_at?: string
          geographic_performance?: Json | null
          id?: string
          inquiries_count?: number | null
          inventory_turnover?: number | null
          orders_count?: number | null
          period_end?: string
          period_start?: string
          product_id?: string
          profit_margin?: number | null
          revenue?: number | null
          seasonal_trends?: Json | null
          tenant_id?: string
          time_period?: string
          updated_at?: string
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_product_analytics_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_categories: {
        Row: {
          created_at: string
          description: string | null
          icon: string | null
          icon_url: string | null
          id: string
          import_metadata: Json | null
          is_active: boolean | null
          master_category_id: string | null
          metadata: Json | null
          name: string
          parent_id: string | null
          slug: string
          sort_order: number | null
          tenant_id: string | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          icon?: string | null
          icon_url?: string | null
          id?: string
          import_metadata?: Json | null
          is_active?: boolean | null
          master_category_id?: string | null
          metadata?: Json | null
          name: string
          parent_id?: string | null
          slug: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          description?: string | null
          icon?: string | null
          icon_url?: string | null
          id?: string
          import_metadata?: Json | null
          is_active?: boolean | null
          master_category_id?: string | null
          metadata?: Json | null
          name?: string
          parent_id?: string | null
          slug?: string
          sort_order?: number | null
          tenant_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_categories_master_category_id_fkey"
            columns: ["master_category_id"]
            isOneToOne: false
            referencedRelation: "master_product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_categories_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
        ]
      }
      product_import_history: {
        Row: {
          completed_at: string | null
          created_at: string | null
          error_log: Json | null
          id: string
          import_type: string
          imported_by: string | null
          items_failed: number | null
          items_imported: number | null
          items_skipped: number | null
          items_updated: number | null
          metadata: Json | null
          source: string | null
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: Json | null
          id?: string
          import_type: string
          imported_by?: string | null
          items_failed?: number | null
          items_imported?: number | null
          items_skipped?: number | null
          items_updated?: number | null
          metadata?: Json | null
          source?: string | null
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          error_log?: Json | null
          id?: string
          import_type?: string
          imported_by?: string | null
          items_failed?: number | null
          items_imported?: number | null
          items_skipped?: number | null
          items_updated?: number | null
          metadata?: Json | null
          source?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "product_import_history_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_reviews: {
        Row: {
          buyer_id: string
          comment: string | null
          created_at: string | null
          farmer_id: string | null
          helpful_count: number | null
          id: string
          images: Json | null
          order_id: string | null
          product_id: string | null
          rating: number
          tenant_id: string | null
          updated_at: string | null
          verified_purchase: boolean | null
        }
        Insert: {
          buyer_id: string
          comment?: string | null
          created_at?: string | null
          farmer_id?: string | null
          helpful_count?: number | null
          id?: string
          images?: Json | null
          order_id?: string | null
          product_id?: string | null
          rating: number
          tenant_id?: string | null
          updated_at?: string | null
          verified_purchase?: boolean | null
        }
        Update: {
          buyer_id?: string
          comment?: string | null
          created_at?: string | null
          farmer_id?: string | null
          helpful_count?: number | null
          id?: string
          images?: Json | null
          order_id?: string | null
          product_id?: string | null
          rating?: number
          tenant_id?: string | null
          updated_at?: string | null
          verified_purchase?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "product_reviews_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "product_reviews_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "marketplace_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "marketplace_products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_reviews_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      product_views: {
        Row: {
          id: string
          ip_address: unknown
          product_id: string | null
          user_id: string | null
          viewed_at: string | null
        }
        Insert: {
          id?: string
          ip_address?: unknown
          product_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Update: {
          id?: string
          ip_address?: unknown
          product_id?: string | null
          user_id?: string | null
          viewed_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_views_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "marketplace_products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          active_ingredients: Json | null
          application_method: string | null
          availability_status: string | null
          batch_number: string | null
          brand: string | null
          bulk_pricing: Json | null
          category_id: string | null
          certification_details: Json | null
          company_id: string | null
          created_at: string
          credit_options: Json | null
          dealer_locations: Json | null
          description: string | null
          discount_percentage: number | null
          dosage_instructions: string | null
          expiry_date: string | null
          id: string
          images: string[] | null
          import_metadata: Json | null
          is_active: boolean | null
          is_featured: boolean | null
          is_organic: boolean | null
          last_restocked_at: string | null
          manufacturer: string | null
          manufacturing_date: string | null
          master_product_id: string | null
          max_order_quantity: number | null
          min_order_quantity: number | null
          minimum_stock_level: number | null
          name: string
          nutrient_composition: Json | null
          ph_range: string | null
          price_per_unit: number | null
          product_type: string | null
          reorder_point: number | null
          safety_precautions: string | null
          shelf_life_months: number | null
          sku: string | null
          solubility: string | null
          specifications: Json | null
          stock_movement_history: Json | null
          stock_quantity: number | null
          storage_conditions: string | null
          suitable_crops: Json | null
          tags: string[] | null
          target_diseases: Json | null
          target_pests: Json | null
          tenant_id: string
          unit_type: string | null
          updated_at: string
          waiting_period_days: number | null
        }
        Insert: {
          active_ingredients?: Json | null
          application_method?: string | null
          availability_status?: string | null
          batch_number?: string | null
          brand?: string | null
          bulk_pricing?: Json | null
          category_id?: string | null
          certification_details?: Json | null
          company_id?: string | null
          created_at?: string
          credit_options?: Json | null
          dealer_locations?: Json | null
          description?: string | null
          discount_percentage?: number | null
          dosage_instructions?: string | null
          expiry_date?: string | null
          id?: string
          images?: string[] | null
          import_metadata?: Json | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_organic?: boolean | null
          last_restocked_at?: string | null
          manufacturer?: string | null
          manufacturing_date?: string | null
          master_product_id?: string | null
          max_order_quantity?: number | null
          min_order_quantity?: number | null
          minimum_stock_level?: number | null
          name: string
          nutrient_composition?: Json | null
          ph_range?: string | null
          price_per_unit?: number | null
          product_type?: string | null
          reorder_point?: number | null
          safety_precautions?: string | null
          shelf_life_months?: number | null
          sku?: string | null
          solubility?: string | null
          specifications?: Json | null
          stock_movement_history?: Json | null
          stock_quantity?: number | null
          storage_conditions?: string | null
          suitable_crops?: Json | null
          tags?: string[] | null
          target_diseases?: Json | null
          target_pests?: Json | null
          tenant_id: string
          unit_type?: string | null
          updated_at?: string
          waiting_period_days?: number | null
        }
        Update: {
          active_ingredients?: Json | null
          application_method?: string | null
          availability_status?: string | null
          batch_number?: string | null
          brand?: string | null
          bulk_pricing?: Json | null
          category_id?: string | null
          certification_details?: Json | null
          company_id?: string | null
          created_at?: string
          credit_options?: Json | null
          dealer_locations?: Json | null
          description?: string | null
          discount_percentage?: number | null
          dosage_instructions?: string | null
          expiry_date?: string | null
          id?: string
          images?: string[] | null
          import_metadata?: Json | null
          is_active?: boolean | null
          is_featured?: boolean | null
          is_organic?: boolean | null
          last_restocked_at?: string | null
          manufacturer?: string | null
          manufacturing_date?: string | null
          master_product_id?: string | null
          max_order_quantity?: number | null
          min_order_quantity?: number | null
          minimum_stock_level?: number | null
          name?: string
          nutrient_composition?: Json | null
          ph_range?: string | null
          price_per_unit?: number | null
          product_type?: string | null
          reorder_point?: number | null
          safety_precautions?: string | null
          shelf_life_months?: number | null
          sku?: string | null
          solubility?: string | null
          specifications?: Json | null
          stock_movement_history?: Json | null
          stock_quantity?: number | null
          storage_conditions?: string | null
          suitable_crops?: Json | null
          tags?: string[] | null
          target_diseases?: Json | null
          target_pests?: Json | null
          tenant_id?: string
          unit_type?: string | null
          updated_at?: string
          waiting_period_days?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "product_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "master_companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "products_master_product_id_fkey"
            columns: ["master_product_id"]
            isOneToOne: false
            referencedRelation: "master_products"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string | null
          email: string | null
          full_name: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string | null
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth_key: string
          created_at: string
          endpoint: string
          farmer_id: string
          id: string
          is_active: boolean
          p256dh_key: string
          tenant_id: string
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth_key: string
          created_at?: string
          endpoint: string
          farmer_id: string
          id?: string
          is_active?: boolean
          p256dh_key: string
          tenant_id: string
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth_key?: string
          created_at?: string
          endpoint?: string
          farmer_id?: string
          id?: string
          is_active?: boolean
          p256dh_key?: string
          tenant_id?: string
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          created_at: string | null
          function_name: string
          id: string
          identifier: string
          last_request: string | null
          metadata: Json | null
          request_count: number
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string | null
          function_name: string
          id?: string
          identifier: string
          last_request?: string | null
          metadata?: Json | null
          request_count?: number
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string | null
          function_name?: string
          id?: string
          identifier?: string
          last_request?: string | null
          metadata?: Json | null
          request_count?: number
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      rate_limit_tracking: {
        Row: {
          created_at: string | null
          endpoint: string
          id: string
          identifier: string
          request_count: number
          updated_at: string | null
          window_end: string
          window_start: string
        }
        Insert: {
          created_at?: string | null
          endpoint: string
          id?: string
          identifier: string
          request_count?: number
          updated_at?: string | null
          window_end: string
          window_start: string
        }
        Update: {
          created_at?: string | null
          endpoint?: string
          id?: string
          identifier?: string
          request_count?: number
          updated_at?: string | null
          window_end?: string
          window_start?: string
        }
        Relationships: []
      }
      rate_limits: {
        Row: {
          created_at: string
          endpoint: string
          id: string
          identifier: string
          identifier_type: string
          last_request: string
          request_count: number
          window_start: string
        }
        Insert: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier: string
          identifier_type: string
          last_request?: string
          request_count?: number
          window_start?: string
        }
        Update: {
          created_at?: string
          endpoint?: string
          id?: string
          identifier?: string
          identifier_type?: string
          last_request?: string
          request_count?: number
          window_start?: string
        }
        Relationships: []
      }
      report_executions: {
        Row: {
          completed_at: string | null
          created_at: string
          error_message: string | null
          executed_by: string | null
          execution_status: string
          execution_time_ms: number | null
          file_url: string | null
          id: string
          report_id: string
          result_data: Json | null
          row_count: number | null
          started_at: string
          tenant_id: string
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          execution_status?: string
          execution_time_ms?: number | null
          file_url?: string | null
          id?: string
          report_id: string
          result_data?: Json | null
          row_count?: number | null
          started_at?: string
          tenant_id: string
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          error_message?: string | null
          executed_by?: string | null
          execution_status?: string
          execution_time_ms?: number | null
          file_url?: string | null
          id?: string
          report_id?: string
          result_data?: Json | null
          row_count?: number | null
          started_at?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_report_executions_report"
            columns: ["report_id"]
            isOneToOne: false
            referencedRelation: "custom_reports"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_report_executions_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_usage: {
        Row: {
          application_method: string | null
          cost_per_unit: number | null
          created_at: string
          effectiveness_rating: number | null
          farmer_id: string
          id: string
          land_id: string
          notes: string | null
          quantity: number
          resource_name: string
          resource_type: string
          tenant_id: string
          total_cost: number | null
          unit: string
          updated_at: string
          usage_date: string
          weather_conditions: Json | null
        }
        Insert: {
          application_method?: string | null
          cost_per_unit?: number | null
          created_at?: string
          effectiveness_rating?: number | null
          farmer_id: string
          id?: string
          land_id: string
          notes?: string | null
          quantity: number
          resource_name: string
          resource_type: string
          tenant_id: string
          total_cost?: number | null
          unit: string
          updated_at?: string
          usage_date: string
          weather_conditions?: Json | null
        }
        Update: {
          application_method?: string | null
          cost_per_unit?: number | null
          created_at?: string
          effectiveness_rating?: number | null
          farmer_id?: string
          id?: string
          land_id?: string
          notes?: string | null
          quantity?: number
          resource_name?: string
          resource_type?: string
          tenant_id?: string
          total_cost?: number | null
          unit?: string
          updated_at?: string
          usage_date?: string
          weather_conditions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_resource_usage_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      resource_utilization: {
        Row: {
          created_at: string
          current_usage: number
          id: string
          max_limit: number | null
          metadata: Json | null
          period_end: string
          period_start: string
          resource_type: string
          tenant_id: string | null
          updated_at: string
          usage_percentage: number | null
        }
        Insert: {
          created_at?: string
          current_usage?: number
          id?: string
          max_limit?: number | null
          metadata?: Json | null
          period_end: string
          period_start: string
          resource_type: string
          tenant_id?: string | null
          updated_at?: string
          usage_percentage?: number | null
        }
        Update: {
          created_at?: string
          current_usage?: number
          id?: string
          max_limit?: number | null
          metadata?: Json | null
          period_end?: string
          period_start?: string
          resource_type?: string
          tenant_id?: string | null
          updated_at?: string
          usage_percentage?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "resource_utilization_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      rule_performance: {
        Row: {
          avg_economic_accuracy: number | null
          avg_farmer_satisfaction: number | null
          created_at: string | null
          failed_outcomes: number | null
          id: string
          last_fired_at: string | null
          partial_outcomes: number | null
          rule_file: string | null
          rule_id: string
          success_rate: number | null
          success_rate_trend: string | null
          successful_outcomes: number | null
          tenant_id: string | null
          times_blocked: number | null
          times_fired: number | null
          updated_at: string | null
        }
        Insert: {
          avg_economic_accuracy?: number | null
          avg_farmer_satisfaction?: number | null
          created_at?: string | null
          failed_outcomes?: number | null
          id?: string
          last_fired_at?: string | null
          partial_outcomes?: number | null
          rule_file?: string | null
          rule_id: string
          success_rate?: number | null
          success_rate_trend?: string | null
          successful_outcomes?: number | null
          tenant_id?: string | null
          times_blocked?: number | null
          times_fired?: number | null
          updated_at?: string | null
        }
        Update: {
          avg_economic_accuracy?: number | null
          avg_farmer_satisfaction?: number | null
          created_at?: string | null
          failed_outcomes?: number | null
          id?: string
          last_fired_at?: string | null
          partial_outcomes?: number | null
          rule_file?: string | null
          rule_id?: string
          success_rate?: number | null
          success_rate_trend?: string | null
          successful_outcomes?: number | null
          tenant_id?: string | null
          times_blocked?: number | null
          times_fired?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "rule_performance_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      safety_verifications: {
        Row: {
          banned_substance_violations: Json | null
          created_at: string | null
          decision_id: string | null
          environmental_concerns: Json | null
          escalation_reason: string | null
          escalation_triggered: boolean | null
          escalation_type: string | null
          expert_assigned: string | null
          expert_response_sla_hours: number | null
          farmer_id: string | null
          food_safety_violations: Json | null
          human_safety_issues: Json | null
          id: string
          overall_status: string | null
          regulatory_issues: Json | null
          session_id: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          banned_substance_violations?: Json | null
          created_at?: string | null
          decision_id?: string | null
          environmental_concerns?: Json | null
          escalation_reason?: string | null
          escalation_triggered?: boolean | null
          escalation_type?: string | null
          expert_assigned?: string | null
          expert_response_sla_hours?: number | null
          farmer_id?: string | null
          food_safety_violations?: Json | null
          human_safety_issues?: Json | null
          id?: string
          overall_status?: string | null
          regulatory_issues?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          banned_substance_violations?: Json | null
          created_at?: string | null
          decision_id?: string | null
          environmental_concerns?: Json | null
          escalation_reason?: string | null
          escalation_triggered?: boolean | null
          escalation_type?: string | null
          expert_assigned?: string | null
          expert_response_sla_hours?: number | null
          farmer_id?: string | null
          food_safety_violations?: Json | null
          human_safety_issues?: Json | null
          id?: string
          overall_status?: string | null
          regulatory_issues?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "safety_verifications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "safety_verifications_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "safety_verifications_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_analytics: {
        Row: {
          created_at: string
          date: string
          dimensions: Json | null
          id: string
          metric_type: string
          metrics: Json | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          date: string
          dimensions?: Json | null
          id?: string
          metric_type: string
          metrics?: Json | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          date?: string
          dimensions?: Json | null
          id?: string
          metric_type?: string
          metrics?: Json | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_order_items: {
        Row: {
          created_at: string
          dealer_commission_amount: number | null
          dealer_commission_rate: number | null
          dealer_id: string | null
          discount_amount: number | null
          discount_percentage: number | null
          farmer_id: string
          id: string
          line_total: number
          notes: string | null
          order_id: string
          product_id: string
          product_name: string
          product_sku: string | null
          quantity: number
          tax_amount: number | null
          tax_percentage: number | null
          tenant_id: string
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dealer_commission_amount?: number | null
          dealer_commission_rate?: number | null
          dealer_id?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          farmer_id: string
          id?: string
          line_total?: number
          notes?: string | null
          order_id: string
          product_id: string
          product_name: string
          product_sku?: string | null
          quantity: number
          tax_amount?: number | null
          tax_percentage?: number | null
          tenant_id: string
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dealer_commission_amount?: number | null
          dealer_commission_rate?: number | null
          dealer_id?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          farmer_id?: string
          id?: string
          line_total?: number
          notes?: string | null
          order_id?: string
          product_id?: string
          product_name?: string
          product_sku?: string | null
          quantity?: number
          tax_amount?: number | null
          tax_percentage?: number | null
          tenant_id?: string
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_order_items_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "sales_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_order_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_orders: {
        Row: {
          billing_address: Json | null
          confirmed_at: string | null
          confirmed_by: string | null
          created_at: string
          created_by: string | null
          dealer_id: string | null
          delivered_at: string | null
          delivery_address: Json | null
          discount_amount: number
          farmer_id: string
          fulfillment_status: string
          id: string
          metadata: Json | null
          notes: string | null
          order_number: string
          order_source: string
          order_status: string
          order_type: string
          payment_method: string | null
          payment_status: string
          shipping_charges: number
          subtotal_amount: number
          tax_amount: number
          tenant_id: string
          total_amount: number
          updated_at: string
        }
        Insert: {
          billing_address?: Json | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          discount_amount?: number
          farmer_id: string
          fulfillment_status?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_number: string
          order_source?: string
          order_status?: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string
          shipping_charges?: number
          subtotal_amount?: number
          tax_amount?: number
          tenant_id: string
          total_amount?: number
          updated_at?: string
        }
        Update: {
          billing_address?: Json | null
          confirmed_at?: string | null
          confirmed_by?: string | null
          created_at?: string
          created_by?: string | null
          dealer_id?: string | null
          delivered_at?: string | null
          delivery_address?: Json | null
          discount_amount?: number
          farmer_id?: string
          fulfillment_status?: string
          id?: string
          metadata?: Json | null
          notes?: string | null
          order_number?: string
          order_source?: string
          order_status?: string
          order_type?: string
          payment_method?: string | null
          payment_status?: string
          shipping_charges?: number
          subtotal_amount?: number
          tax_amount?: number
          tenant_id?: string
          total_amount?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_orders_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_orders_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "sales_orders_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_return_items: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          order_item_id: string
          product_id: string
          quantity: number
          refund_amount: number
          return_condition: string
          return_id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          order_item_id: string
          product_id: string
          quantity: number
          refund_amount?: number
          return_condition: string
          return_id: string
          tenant_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          order_item_id?: string
          product_id?: string
          quantity?: number
          refund_amount?: number
          return_condition?: string
          return_id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_return_items_order_item_id_fkey"
            columns: ["order_item_id"]
            isOneToOne: false
            referencedRelation: "sales_order_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_return_id_fkey"
            columns: ["return_id"]
            isOneToOne: false
            referencedRelation: "sales_returns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_return_items_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sales_returns: {
        Row: {
          approved_at: string | null
          created_at: string
          dealer_id: string | null
          farmer_id: string
          id: string
          notes: string | null
          order_id: string
          received_at: string | null
          refund_method: string | null
          refund_status: string | null
          refunded_at: string | null
          requested_at: string
          return_amount: number
          return_number: string
          return_reason: string
          return_status: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          created_at?: string
          dealer_id?: string | null
          farmer_id: string
          id?: string
          notes?: string | null
          order_id: string
          received_at?: string | null
          refund_method?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          requested_at?: string
          return_amount?: number
          return_number: string
          return_reason: string
          return_status?: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          created_at?: string
          dealer_id?: string | null
          farmer_id?: string
          id?: string
          notes?: string | null
          order_id?: string
          received_at?: string | null
          refund_method?: string | null
          refund_status?: string | null
          refunded_at?: string | null
          requested_at?: string
          return_amount?: number
          return_number?: string
          return_reason?: string
          return_status?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sales_returns_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "sales_returns_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "sales_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sales_returns_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sas_token_cache: {
        Row: {
          created_at: string | null
          expires_at: string
          id: string
          provider: string | null
          token: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          expires_at: string
          id: string
          provider?: string | null
          token: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          expires_at?: string
          id?: string
          provider?: string | null
          token?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      satellite_alerts: {
        Row: {
          affected_area_percentage: number | null
          alert_type: string
          created_at: string | null
          description: string | null
          farmer_id: string
          id: string
          land_id: string
          metadata: Json | null
          ndvi_change: number | null
          recommendations: Json | null
          resolved_at: string | null
          severity: string
          status: string | null
          tenant_id: string
          title: string
          trigger_values: Json | null
        }
        Insert: {
          affected_area_percentage?: number | null
          alert_type: string
          created_at?: string | null
          description?: string | null
          farmer_id: string
          id?: string
          land_id: string
          metadata?: Json | null
          ndvi_change?: number | null
          recommendations?: Json | null
          resolved_at?: string | null
          severity: string
          status?: string | null
          tenant_id: string
          title: string
          trigger_values?: Json | null
        }
        Update: {
          affected_area_percentage?: number | null
          alert_type?: string
          created_at?: string | null
          description?: string | null
          farmer_id?: string
          id?: string
          land_id?: string
          metadata?: Json | null
          ndvi_change?: number | null
          recommendations?: Json | null
          resolved_at?: string | null
          severity?: string
          status?: string | null
          tenant_id?: string
          title?: string
          trigger_values?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_satellite_alerts_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satellite_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "satellite_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "satellite_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "satellite_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "satellite_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satellite_alerts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      satellite_api_usage: {
        Row: {
          api_source: string
          bandwidth_mb: number | null
          created_at: string | null
          date: string | null
          failure_count: number | null
          id: string
          operation_type: string
          success_count: number | null
          tenant_id: string | null
          tiles_processed: number | null
          total_cost_estimate: number | null
        }
        Insert: {
          api_source: string
          bandwidth_mb?: number | null
          created_at?: string | null
          date?: string | null
          failure_count?: number | null
          id?: string
          operation_type: string
          success_count?: number | null
          tenant_id?: string | null
          tiles_processed?: number | null
          total_cost_estimate?: number | null
        }
        Update: {
          api_source?: string
          bandwidth_mb?: number | null
          created_at?: string | null
          date?: string | null
          failure_count?: number | null
          id?: string
          operation_type?: string
          success_count?: number | null
          tenant_id?: string | null
          tiles_processed?: number | null
          total_cost_estimate?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "satellite_api_usage_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      satellite_imagery: {
        Row: {
          acquisition_date: string
          bounds: Json
          cloud_coverage: number | null
          collection_id: string
          created_at: string | null
          download_status: string | null
          file_size_mb: number | null
          id: string
          image_urls: Json
          land_id: string
          processed_indices: Json | null
          scene_id: string
          spatial_resolution: number | null
          tenant_id: string
          tile_id: string | null
          updated_at: string | null
        }
        Insert: {
          acquisition_date: string
          bounds: Json
          cloud_coverage?: number | null
          collection_id?: string
          created_at?: string | null
          download_status?: string | null
          file_size_mb?: number | null
          id?: string
          image_urls: Json
          land_id: string
          processed_indices?: Json | null
          scene_id: string
          spatial_resolution?: number | null
          tenant_id: string
          tile_id?: string | null
          updated_at?: string | null
        }
        Update: {
          acquisition_date?: string
          bounds?: Json
          cloud_coverage?: number | null
          collection_id?: string
          created_at?: string | null
          download_status?: string | null
          file_size_mb?: number | null
          id?: string
          image_urls?: Json
          land_id?: string
          processed_indices?: Json | null
          scene_id?: string
          spatial_resolution?: number | null
          tenant_id?: string
          tile_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_satellite_imagery_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satellite_imagery_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "satellite_imagery_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "satellite_imagery_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "satellite_imagery_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "satellite_imagery_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satellite_imagery_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      satellite_storage_audit: {
        Row: {
          created_at: string
          file_exists: boolean
          file_size_bytes: number | null
          file_type: string
          id: string
          last_verified_at: string
          metadata: Json | null
          satellite_tile_id: string
          storage_path: string
          updated_at: string
          verification_error: string | null
        }
        Insert: {
          created_at?: string
          file_exists?: boolean
          file_size_bytes?: number | null
          file_type: string
          id?: string
          last_verified_at?: string
          metadata?: Json | null
          satellite_tile_id: string
          storage_path: string
          updated_at?: string
          verification_error?: string | null
        }
        Update: {
          created_at?: string
          file_exists?: boolean
          file_size_bytes?: number | null
          file_type?: string
          id?: string
          last_verified_at?: string
          metadata?: Json | null
          satellite_tile_id?: string
          storage_path?: string
          updated_at?: string
          verification_error?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "satellite_storage_audit_satellite_tile_id_fkey"
            columns: ["satellite_tile_id"]
            isOneToOne: false
            referencedRelation: "satellite_tiles"
            referencedColumns: ["id"]
          },
        ]
      }
      satellite_tiles: {
        Row: {
          acquisition_date: string
          actual_download_status: string | null
          api_source: string | null
          bbox: Json | null
          bbox_geom: unknown
          cloud_cover: number | null
          collection: string
          country_id: string | null
          created_at: string | null
          data_completeness_percent: number | null
          error_message: string | null
          file_size_mb: number | null
          id: string
          mgrs_tile_id: string | null
          ndvi_calculation_timestamp: string | null
          ndvi_max: number | null
          ndvi_mean: number | null
          ndvi_min: number | null
          ndvi_path: string | null
          ndvi_size_bytes: number | null
          ndvi_std_dev: number | null
          nir_band_path: string | null
          nir_band_size_bytes: number | null
          pixel_count: number | null
          processing_completed_at: string | null
          processing_level: string | null
          processing_method: string | null
          processing_stage: string | null
          red_band_path: string | null
          red_band_size_bytes: number | null
          resolution: string | null
          status: string | null
          tile_id: string
          updated_at: string | null
          valid_pixel_count: number | null
          vegetation_coverage_percent: number | null
          vegetation_health_score: number | null
        }
        Insert: {
          acquisition_date: string
          actual_download_status?: string | null
          api_source?: string | null
          bbox?: Json | null
          bbox_geom?: unknown
          cloud_cover?: number | null
          collection?: string
          country_id?: string | null
          created_at?: string | null
          data_completeness_percent?: number | null
          error_message?: string | null
          file_size_mb?: number | null
          id?: string
          mgrs_tile_id?: string | null
          ndvi_calculation_timestamp?: string | null
          ndvi_max?: number | null
          ndvi_mean?: number | null
          ndvi_min?: number | null
          ndvi_path?: string | null
          ndvi_size_bytes?: number | null
          ndvi_std_dev?: number | null
          nir_band_path?: string | null
          nir_band_size_bytes?: number | null
          pixel_count?: number | null
          processing_completed_at?: string | null
          processing_level?: string | null
          processing_method?: string | null
          processing_stage?: string | null
          red_band_path?: string | null
          red_band_size_bytes?: number | null
          resolution?: string | null
          status?: string | null
          tile_id: string
          updated_at?: string | null
          valid_pixel_count?: number | null
          vegetation_coverage_percent?: number | null
          vegetation_health_score?: number | null
        }
        Update: {
          acquisition_date?: string
          actual_download_status?: string | null
          api_source?: string | null
          bbox?: Json | null
          bbox_geom?: unknown
          cloud_cover?: number | null
          collection?: string
          country_id?: string | null
          created_at?: string | null
          data_completeness_percent?: number | null
          error_message?: string | null
          file_size_mb?: number | null
          id?: string
          mgrs_tile_id?: string | null
          ndvi_calculation_timestamp?: string | null
          ndvi_max?: number | null
          ndvi_mean?: number | null
          ndvi_min?: number | null
          ndvi_path?: string | null
          ndvi_size_bytes?: number | null
          ndvi_std_dev?: number | null
          nir_band_path?: string | null
          nir_band_size_bytes?: number | null
          pixel_count?: number | null
          processing_completed_at?: string | null
          processing_level?: string | null
          processing_method?: string | null
          processing_stage?: string | null
          red_band_path?: string | null
          red_band_size_bytes?: number | null
          resolution?: string | null
          status?: string | null
          tile_id?: string
          updated_at?: string | null
          valid_pixel_count?: number | null
          vegetation_coverage_percent?: number | null
          vegetation_health_score?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "satellite_tiles_mgrs_tile_id_fkey"
            columns: ["mgrs_tile_id"]
            isOneToOne: false
            referencedRelation: "mgrs_tiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "satellite_tiles_tile_id_country_id_fkey"
            columns: ["tile_id", "country_id"]
            isOneToOne: false
            referencedRelation: "mgrs_tiles"
            referencedColumns: ["tile_id", "country_id"]
          },
        ]
      }
      schedule_climate_monitoring: {
        Row: {
          adjustment_reason: string | null
          adjustment_triggered: boolean | null
          created_at: string | null
          id: string
          monitoring_date: string
          ndvi_value: number | null
          rainfall_24h: number | null
          schedule_id: string
          tasks_rescheduled: number | null
          temperature_avg: number | null
        }
        Insert: {
          adjustment_reason?: string | null
          adjustment_triggered?: boolean | null
          created_at?: string | null
          id?: string
          monitoring_date: string
          ndvi_value?: number | null
          rainfall_24h?: number | null
          schedule_id: string
          tasks_rescheduled?: number | null
          temperature_avg?: number | null
        }
        Update: {
          adjustment_reason?: string | null
          adjustment_triggered?: boolean | null
          created_at?: string | null
          id?: string
          monitoring_date?: string
          ndvi_value?: number | null
          rainfall_24h?: number | null
          schedule_id?: string
          tasks_rescheduled?: number | null
          temperature_avg?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_climate_monitoring_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "crop_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      schedule_monitoring: {
        Row: {
          alerts_generated: number | null
          check_date: string
          created_at: string | null
          disease_detected: boolean | null
          farmer_id: string
          health_score: number | null
          id: string
          land_id: string
          ndvi_value: number | null
          npk_levels: Json | null
          pest_detected: boolean | null
          refinements_applied: number | null
          schedule_id: string
          soil_moisture: number | null
          soil_ph: number | null
          tenant_id: string
          weather_conditions: Json | null
        }
        Insert: {
          alerts_generated?: number | null
          check_date: string
          created_at?: string | null
          disease_detected?: boolean | null
          farmer_id: string
          health_score?: number | null
          id?: string
          land_id: string
          ndvi_value?: number | null
          npk_levels?: Json | null
          pest_detected?: boolean | null
          refinements_applied?: number | null
          schedule_id: string
          soil_moisture?: number | null
          soil_ph?: number | null
          tenant_id: string
          weather_conditions?: Json | null
        }
        Update: {
          alerts_generated?: number | null
          check_date?: string
          created_at?: string | null
          disease_detected?: boolean | null
          farmer_id?: string
          health_score?: number | null
          id?: string
          land_id?: string
          ndvi_value?: number | null
          npk_levels?: Json | null
          pest_detected?: boolean | null
          refinements_applied?: number | null
          schedule_id?: string
          soil_moisture?: number | null
          soil_ph?: number | null
          tenant_id?: string
          weather_conditions?: Json | null
        }
        Relationships: []
      }
      schedule_tasks: {
        Row: {
          auto_rescheduled: boolean | null
          climate_adjusted: boolean | null
          climate_adjustment_reason: string | null
          completed_at: string | null
          completed_by: string | null
          completion_notes: string | null
          created_at: string | null
          currency: string | null
          days_from_sowing: number | null
          detailed_steps: Json | null
          duration_hours: number | null
          estimated_cost: number | null
          farmer_id: string | null
          id: string
          ideal_weather: Json | null
          instructions: string[] | null
          language: string | null
          original_date: string | null
          original_date_before_climate_adjust: string | null
          precautions: string[] | null
          priority: string | null
          product_recommendations: Json | null
          product_type: string | null
          regional_terms: Json | null
          reschedule_reason: string | null
          resources: Json | null
          schedule_id: string
          sequence_order: number | null
          skip_penalty: string | null
          skip_penalty_details: Json | null
          stage_key: string | null
          stage_name: string | null
          stage_order: number | null
          status: string | null
          task_date: string
          task_description: string | null
          task_name: string
          task_type: string
          tenant_id: string
          updated_at: string | null
          water_required_liters: number | null
          weather_dependent: boolean | null
          weather_risk_level: string | null
          yield_boost_technique: string | null
          yield_impact: string | null
          yield_impact_details: Json | null
        }
        Insert: {
          auto_rescheduled?: boolean | null
          climate_adjusted?: boolean | null
          climate_adjustment_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string | null
          currency?: string | null
          days_from_sowing?: number | null
          detailed_steps?: Json | null
          duration_hours?: number | null
          estimated_cost?: number | null
          farmer_id?: string | null
          id?: string
          ideal_weather?: Json | null
          instructions?: string[] | null
          language?: string | null
          original_date?: string | null
          original_date_before_climate_adjust?: string | null
          precautions?: string[] | null
          priority?: string | null
          product_recommendations?: Json | null
          product_type?: string | null
          regional_terms?: Json | null
          reschedule_reason?: string | null
          resources?: Json | null
          schedule_id: string
          sequence_order?: number | null
          skip_penalty?: string | null
          skip_penalty_details?: Json | null
          stage_key?: string | null
          stage_name?: string | null
          stage_order?: number | null
          status?: string | null
          task_date: string
          task_description?: string | null
          task_name: string
          task_type: string
          tenant_id?: string
          updated_at?: string | null
          water_required_liters?: number | null
          weather_dependent?: boolean | null
          weather_risk_level?: string | null
          yield_boost_technique?: string | null
          yield_impact?: string | null
          yield_impact_details?: Json | null
        }
        Update: {
          auto_rescheduled?: boolean | null
          climate_adjusted?: boolean | null
          climate_adjustment_reason?: string | null
          completed_at?: string | null
          completed_by?: string | null
          completion_notes?: string | null
          created_at?: string | null
          currency?: string | null
          days_from_sowing?: number | null
          detailed_steps?: Json | null
          duration_hours?: number | null
          estimated_cost?: number | null
          farmer_id?: string | null
          id?: string
          ideal_weather?: Json | null
          instructions?: string[] | null
          language?: string | null
          original_date?: string | null
          original_date_before_climate_adjust?: string | null
          precautions?: string[] | null
          priority?: string | null
          product_recommendations?: Json | null
          product_type?: string | null
          regional_terms?: Json | null
          reschedule_reason?: string | null
          resources?: Json | null
          schedule_id?: string
          sequence_order?: number | null
          skip_penalty?: string | null
          skip_penalty_details?: Json | null
          stage_key?: string | null
          stage_name?: string | null
          stage_order?: number | null
          status?: string | null
          task_date?: string
          task_description?: string | null
          task_name?: string
          task_type?: string
          tenant_id?: string
          updated_at?: string | null
          water_required_liters?: number | null
          weather_dependent?: boolean | null
          weather_risk_level?: string | null
          yield_boost_technique?: string | null
          yield_impact?: string | null
          yield_impact_details?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "schedule_tasks_schedule_id_fkey"
            columns: ["schedule_id"]
            isOneToOne: false
            referencedRelation: "crop_schedules"
            referencedColumns: ["id"]
          },
        ]
      }
      scheduled_reports: {
        Row: {
          created_at: string | null
          created_by: string
          description: string | null
          id: string
          is_active: boolean | null
          last_run_at: string | null
          next_run_at: string | null
          recipients: string[]
          report_config: Json
          report_name: string
          schedule_cron: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          recipients: string[]
          report_config: Json
          report_name: string
          schedule_cron: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          last_run_at?: string | null
          next_run_at?: string | null
          recipients?: string[]
          report_config?: Json
          report_name?: string
          schedule_cron?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      scraper_execution_log: {
        Row: {
          commodities_fetched: number | null
          completed_at: string | null
          created_at: string | null
          duration_seconds: number | null
          error_message: string | null
          errors_count: number | null
          id: string
          metadata: Json | null
          organization: string
          records_scraped: number | null
          records_upserted: number | null
          source_id: string | null
          started_at: string
          state_code: string
          status: string | null
        }
        Insert: {
          commodities_fetched?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          errors_count?: number | null
          id?: string
          metadata?: Json | null
          organization: string
          records_scraped?: number | null
          records_upserted?: number | null
          source_id?: string | null
          started_at: string
          state_code: string
          status?: string | null
        }
        Update: {
          commodities_fetched?: number | null
          completed_at?: string | null
          created_at?: string | null
          duration_seconds?: number | null
          error_message?: string | null
          errors_count?: number | null
          id?: string
          metadata?: Json | null
          organization?: string
          records_scraped?: number | null
          records_upserted?: number | null
          source_id?: string | null
          started_at?: string
          state_code?: string
          status?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scraper_execution_log_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "agri_market_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      scraper_plugins: {
        Row: {
          author: string | null
          config_schema: Json | null
          created_at: string | null
          description: string | null
          display_name: string
          id: string
          is_active: boolean | null
          python_module: string
          scraper_class: string
          supported_states: string[] | null
          updated_at: string | null
          version: string | null
        }
        Insert: {
          author?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          is_active?: boolean | null
          python_module: string
          scraper_class: string
          supported_states?: string[] | null
          updated_at?: string | null
          version?: string | null
        }
        Update: {
          author?: string | null
          config_schema?: Json | null
          created_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          is_active?: boolean | null
          python_module?: string
          scraper_class?: string
          supported_states?: string[] | null
          updated_at?: string | null
          version?: string | null
        }
        Relationships: []
      }
      search_history: {
        Row: {
          created_at: string | null
          id: string
          results_count: number | null
          search_term: string
          user_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          results_count?: number | null
          search_term: string
          user_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          results_count?: number | null
          search_term?: string
          user_id?: string
        }
        Relationships: []
      }
      security_alerts: {
        Row: {
          alert_type: string
          created_at: string | null
          event_details: Json | null
          id: string
          is_active: boolean | null
          message: string
          metadata: Json | null
          resolved_at: string | null
          resolved_by: string | null
          severity: string
          tenant_id: string | null
          user_id: string | null
        }
        Insert: {
          alert_type: string
          created_at?: string | null
          event_details?: Json | null
          id?: string
          is_active?: boolean | null
          message: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Update: {
          alert_type?: string
          created_at?: string | null
          event_details?: Json | null
          id?: string
          is_active?: boolean | null
          message?: string
          metadata?: Json | null
          resolved_at?: string | null
          resolved_by?: string | null
          severity?: string
          tenant_id?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_audit_log: {
        Row: {
          attempted_tenant_id: string | null
          created_at: string | null
          details: Json | null
          event_type: string
          id: string
          ip_address: unknown
          operation: string | null
          table_name: string | null
          user_agent: string | null
          user_id: string | null
          user_tenant_id: string | null
        }
        Insert: {
          attempted_tenant_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type: string
          id?: string
          ip_address?: unknown
          operation?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_tenant_id?: string | null
        }
        Update: {
          attempted_tenant_id?: string | null
          created_at?: string | null
          details?: Json | null
          event_type?: string
          id?: string
          ip_address?: unknown
          operation?: string | null
          table_name?: string | null
          user_agent?: string | null
          user_id?: string | null
          user_tenant_id?: string | null
        }
        Relationships: []
      }
      security_events: {
        Row: {
          created_at: string
          event_details: Json | null
          event_type: string
          id: string
          ip_address: string | null
          metadata: Json | null
          risk_level: string | null
          tenant_id: string | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          event_details?: Json | null
          event_type: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          risk_level?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          event_details?: Json | null
          event_type?: string
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          risk_level?: string | null
          tenant_id?: string | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      security_settings: {
        Row: {
          audit_settings: Json | null
          created_at: string | null
          id: string
          ip_whitelist: Json | null
          login_restrictions: Json | null
          mfa_settings: Json | null
          password_policy: Json | null
          session_settings: Json | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          audit_settings?: Json | null
          created_at?: string | null
          id?: string
          ip_whitelist?: Json | null
          login_restrictions?: Json | null
          mfa_settings?: Json | null
          password_policy?: Json | null
          session_settings?: Json | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          audit_settings?: Json | null
          created_at?: string | null
          id?: string
          ip_whitelist?: Json | null
          login_restrictions?: Json | null
          mfa_settings?: Json | null
          password_policy?: Json | null
          session_settings?: Json | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "security_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      shopping_carts: {
        Row: {
          cart_status: string
          created_at: string
          dealer_id: string | null
          farmer_id: string
          id: string
          last_activity_at: string
          metadata: Json | null
          session_id: string | null
          tenant_id: string
          updated_at: string
        }
        Insert: {
          cart_status?: string
          created_at?: string
          dealer_id?: string | null
          farmer_id: string
          id?: string
          last_activity_at?: string
          metadata?: Json | null
          session_id?: string | null
          tenant_id: string
          updated_at?: string
        }
        Update: {
          cart_status?: string
          created_at?: string
          dealer_id?: string | null
          farmer_id?: string
          id?: string
          last_activity_at?: string
          metadata?: Json | null
          session_id?: string | null
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "shopping_carts_dealer_id_fkey"
            columns: ["dealer_id"]
            isOneToOne: false
            referencedRelation: "dealers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_carts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "shopping_carts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "shopping_carts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      social_posts: {
        Row: {
          comments_count: number | null
          community_id: string | null
          content: string | null
          created_at: string | null
          engagement_score: number | null
          farmer_id: string
          hashtags: string[] | null
          helpful_count: number | null
          id: string
          is_expert_verified: boolean | null
          is_pinned: boolean | null
          is_published: boolean | null
          is_success_story: boolean | null
          language_code: string | null
          likes_count: number | null
          location_data: Json | null
          media_urls: Json | null
          metadata: Json | null
          moderation_status: string | null
          parent_post_id: string | null
          poll_options: Json | null
          post_type: Database["public"]["Enums"]["post_type"]
          saves_count: number | null
          shares_count: number | null
          status: Database["public"]["Enums"]["post_status"] | null
          tenant_id: string
          thanks_count: number | null
          translations: Json | null
          tried_count: number | null
          updated_at: string | null
          views_count: number | null
        }
        Insert: {
          comments_count?: number | null
          community_id?: string | null
          content?: string | null
          created_at?: string | null
          engagement_score?: number | null
          farmer_id: string
          hashtags?: string[] | null
          helpful_count?: number | null
          id?: string
          is_expert_verified?: boolean | null
          is_pinned?: boolean | null
          is_published?: boolean | null
          is_success_story?: boolean | null
          language_code?: string | null
          likes_count?: number | null
          location_data?: Json | null
          media_urls?: Json | null
          metadata?: Json | null
          moderation_status?: string | null
          parent_post_id?: string | null
          poll_options?: Json | null
          post_type?: Database["public"]["Enums"]["post_type"]
          saves_count?: number | null
          shares_count?: number | null
          status?: Database["public"]["Enums"]["post_status"] | null
          tenant_id: string
          thanks_count?: number | null
          translations?: Json | null
          tried_count?: number | null
          updated_at?: string | null
          views_count?: number | null
        }
        Update: {
          comments_count?: number | null
          community_id?: string | null
          content?: string | null
          created_at?: string | null
          engagement_score?: number | null
          farmer_id?: string
          hashtags?: string[] | null
          helpful_count?: number | null
          id?: string
          is_expert_verified?: boolean | null
          is_pinned?: boolean | null
          is_published?: boolean | null
          is_success_story?: boolean | null
          language_code?: string | null
          likes_count?: number | null
          location_data?: Json | null
          media_urls?: Json | null
          metadata?: Json | null
          moderation_status?: string | null
          parent_post_id?: string | null
          poll_options?: Json | null
          post_type?: Database["public"]["Enums"]["post_type"]
          saves_count?: number | null
          shares_count?: number | null
          status?: Database["public"]["Enums"]["post_status"] | null
          tenant_id?: string
          thanks_count?: number | null
          translations?: Json | null
          tried_count?: number | null
          updated_at?: string | null
          views_count?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "social_posts_community_id_fkey"
            columns: ["community_id"]
            isOneToOne: false
            referencedRelation: "communities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "social_posts_parent_post_id_fkey"
            columns: ["parent_post_id"]
            isOneToOne: false
            referencedRelation: "social_posts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "social_posts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      soil_health: {
        Row: {
          agro_climatic_zone: string | null
          bulk_density: number | null
          cec: number | null
          clay_percent: number | null
          clay_std: number | null
          confidence_level: string | null
          created_at: string
          data_completeness: number | null
          data_quality_flags: Json | null
          data_quality_warnings: Json | null
          evapotranspiration_mm: number | null
          farmer_id: string | null
          fertility_class: string | null
          field_area_ha: number | null
          humidity_avg_percent: number | null
          id: string
          land_id: string
          moisture_measurement_date: number | null
          moisture_status: string | null
          nitrogen_confidence: string | null
          nitrogen_est: number | null
          nitrogen_kg_per_ha: number | null
          nitrogen_level: string | null
          nitrogen_text: string | null
          nitrogen_total_kg: number | null
          note: string | null
          organic_carbon: number | null
          organic_carbon_max: number | null
          organic_carbon_min: number | null
          organic_carbon_std: number | null
          organic_carbon_text: string | null
          ph_level: number | null
          ph_max: number | null
          ph_min: number | null
          ph_std: number | null
          ph_text: string | null
          phosphorus_confidence: string | null
          phosphorus_est: number | null
          phosphorus_kg_per_ha: number | null
          phosphorus_level: string | null
          phosphorus_text: string | null
          phosphorus_total_kg: number | null
          potassium_confidence: string | null
          potassium_est: number | null
          potassium_kg_per_ha: number | null
          potassium_level: string | null
          potassium_text: string | null
          potassium_total_kg: number | null
          precipitation_30d_mm: number | null
          sample_count: number | null
          sand_percent: number | null
          sand_std: number | null
          silt_percent: number | null
          silt_std: number | null
          soil_moisture_profile_percent: number | null
          soil_moisture_rootzone_percent: number | null
          soil_moisture_surface_percent: number | null
          soil_temperature_c: number | null
          soil_type: string | null
          source: string
          temperature_avg_c: number | null
          temperature_max_c: number | null
          temperature_min_c: number | null
          tenant_id: string
          test_date: string | null
          test_report_url: string | null
          texture: string | null
          updated_at: string
          water_balance_mm: number | null
        }
        Insert: {
          agro_climatic_zone?: string | null
          bulk_density?: number | null
          cec?: number | null
          clay_percent?: number | null
          clay_std?: number | null
          confidence_level?: string | null
          created_at?: string
          data_completeness?: number | null
          data_quality_flags?: Json | null
          data_quality_warnings?: Json | null
          evapotranspiration_mm?: number | null
          farmer_id?: string | null
          fertility_class?: string | null
          field_area_ha?: number | null
          humidity_avg_percent?: number | null
          id?: string
          land_id: string
          moisture_measurement_date?: number | null
          moisture_status?: string | null
          nitrogen_confidence?: string | null
          nitrogen_est?: number | null
          nitrogen_kg_per_ha?: number | null
          nitrogen_level?: string | null
          nitrogen_text?: string | null
          nitrogen_total_kg?: number | null
          note?: string | null
          organic_carbon?: number | null
          organic_carbon_max?: number | null
          organic_carbon_min?: number | null
          organic_carbon_std?: number | null
          organic_carbon_text?: string | null
          ph_level?: number | null
          ph_max?: number | null
          ph_min?: number | null
          ph_std?: number | null
          ph_text?: string | null
          phosphorus_confidence?: string | null
          phosphorus_est?: number | null
          phosphorus_kg_per_ha?: number | null
          phosphorus_level?: string | null
          phosphorus_text?: string | null
          phosphorus_total_kg?: number | null
          potassium_confidence?: string | null
          potassium_est?: number | null
          potassium_kg_per_ha?: number | null
          potassium_level?: string | null
          potassium_text?: string | null
          potassium_total_kg?: number | null
          precipitation_30d_mm?: number | null
          sample_count?: number | null
          sand_percent?: number | null
          sand_std?: number | null
          silt_percent?: number | null
          silt_std?: number | null
          soil_moisture_profile_percent?: number | null
          soil_moisture_rootzone_percent?: number | null
          soil_moisture_surface_percent?: number | null
          soil_temperature_c?: number | null
          soil_type?: string | null
          source?: string
          temperature_avg_c?: number | null
          temperature_max_c?: number | null
          temperature_min_c?: number | null
          tenant_id: string
          test_date?: string | null
          test_report_url?: string | null
          texture?: string | null
          updated_at?: string
          water_balance_mm?: number | null
        }
        Update: {
          agro_climatic_zone?: string | null
          bulk_density?: number | null
          cec?: number | null
          clay_percent?: number | null
          clay_std?: number | null
          confidence_level?: string | null
          created_at?: string
          data_completeness?: number | null
          data_quality_flags?: Json | null
          data_quality_warnings?: Json | null
          evapotranspiration_mm?: number | null
          farmer_id?: string | null
          fertility_class?: string | null
          field_area_ha?: number | null
          humidity_avg_percent?: number | null
          id?: string
          land_id?: string
          moisture_measurement_date?: number | null
          moisture_status?: string | null
          nitrogen_confidence?: string | null
          nitrogen_est?: number | null
          nitrogen_kg_per_ha?: number | null
          nitrogen_level?: string | null
          nitrogen_text?: string | null
          nitrogen_total_kg?: number | null
          note?: string | null
          organic_carbon?: number | null
          organic_carbon_max?: number | null
          organic_carbon_min?: number | null
          organic_carbon_std?: number | null
          organic_carbon_text?: string | null
          ph_level?: number | null
          ph_max?: number | null
          ph_min?: number | null
          ph_std?: number | null
          ph_text?: string | null
          phosphorus_confidence?: string | null
          phosphorus_est?: number | null
          phosphorus_kg_per_ha?: number | null
          phosphorus_level?: string | null
          phosphorus_text?: string | null
          phosphorus_total_kg?: number | null
          potassium_confidence?: string | null
          potassium_est?: number | null
          potassium_kg_per_ha?: number | null
          potassium_level?: string | null
          potassium_text?: string | null
          potassium_total_kg?: number | null
          precipitation_30d_mm?: number | null
          sample_count?: number | null
          sand_percent?: number | null
          sand_std?: number | null
          silt_percent?: number | null
          silt_std?: number | null
          soil_moisture_profile_percent?: number | null
          soil_moisture_rootzone_percent?: number | null
          soil_moisture_surface_percent?: number | null
          soil_temperature_c?: number | null
          soil_type?: string | null
          source?: string
          temperature_avg_c?: number | null
          temperature_max_c?: number | null
          temperature_min_c?: number | null
          tenant_id?: string
          test_date?: string | null
          test_report_url?: string | null
          texture?: string | null
          updated_at?: string
          water_balance_mm?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "soil_health_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soil_health_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "soil_health_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      soil_types: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          value?: string
        }
        Relationships: []
      }
      spatial_ref_sys: {
        Row: {
          auth_name: string | null
          auth_srid: number | null
          proj4text: string | null
          srid: number
          srtext: string | null
        }
        Insert: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid: number
          srtext?: string | null
        }
        Update: {
          auth_name?: string | null
          auth_srid?: number | null
          proj4text?: string | null
          srid?: number
          srtext?: string | null
        }
        Relationships: []
      }
      staging_mgrs_tiles: {
        Row: {
          geometry: unknown
          id: string
          properties: Json | null
          tile_id: string | null
        }
        Insert: {
          geometry?: unknown
          id?: string
          properties?: Json | null
          tile_id?: string | null
        }
        Update: {
          geometry?: unknown
          id?: string
          properties?: Json | null
          tile_id?: string | null
        }
        Relationships: []
      }
      staging_mgrs_tiles_wkb: {
        Row: {
          geometry_wkb: string | null
          tile_id: string | null
        }
        Insert: {
          geometry_wkb?: string | null
          tile_id?: string | null
        }
        Update: {
          geometry_wkb?: string | null
          tile_id?: string | null
        }
        Relationships: []
      }
      staging_mgrs_tiles_wkt: {
        Row: {
          geometry_wkt: string | null
          tile_id: string | null
        }
        Insert: {
          geometry_wkt?: string | null
          tile_id?: string | null
        }
        Update: {
          geometry_wkt?: string | null
          tile_id?: string | null
        }
        Relationships: []
      }
      staging_states: {
        Row: {
          geometry_wkt: string | null
          state_code: string | null
          state_name: string | null
        }
        Insert: {
          geometry_wkt?: string | null
          state_code?: string | null
          state_name?: string | null
        }
        Update: {
          geometry_wkt?: string | null
          state_code?: string | null
          state_name?: string | null
        }
        Relationships: []
      }
      states: {
        Row: {
          code: string | null
          country_id: string
          created_at: string | null
          geometry: unknown
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          code?: string | null
          country_id: string
          created_at?: string | null
          geometry?: unknown
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          code?: string | null
          country_id?: string
          created_at?: string | null
          geometry?: unknown
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "states_country_id_fkey"
            columns: ["country_id"]
            isOneToOne: false
            referencedRelation: "countries"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_movements: {
        Row: {
          created_at: string | null
          id: string
          movement_type: string
          new_stock: number
          performed_by: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reason: string | null
          reference_number: string | null
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          id?: string
          movement_type: string
          new_stock: number
          performed_by?: string | null
          previous_stock: number
          product_id: string
          quantity: number
          reason?: string | null
          reference_number?: string | null
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          id?: string
          movement_type?: string
          new_stock?: number
          performed_by?: string | null
          previous_stock?: number
          product_id?: string
          quantity?: number
          reason?: string | null
          reference_number?: string | null
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_addon_assignments: {
        Row: {
          added_at: string
          addon_id: string
          id: string
          is_active: boolean | null
          metadata: Json | null
          quantity: number
          removed_at: string | null
          subscription_id: string
        }
        Insert: {
          added_at?: string
          addon_id: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          quantity?: number
          removed_at?: string | null
          subscription_id: string
        }
        Update: {
          added_at?: string
          addon_id?: string
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          quantity?: number
          removed_at?: string | null
          subscription_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_addon_assignments_addon_id_fkey"
            columns: ["addon_id"]
            isOneToOne: false
            referencedRelation: "subscription_addons"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_addons: {
        Row: {
          addon_type: string
          created_at: string
          description: string | null
          id: string
          is_active: boolean | null
          is_metered: boolean | null
          metadata: Json | null
          name: string
          plan_category: string
          price_annually: number
          price_monthly: number
          sort_order: number | null
          stripe_price_id_annually: string | null
          stripe_price_id_monthly: string | null
          stripe_product_id: string | null
          unit_price: number | null
          updated_at: string
        }
        Insert: {
          addon_type: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_metered?: boolean | null
          metadata?: Json | null
          name: string
          plan_category?: string
          price_annually?: number
          price_monthly?: number
          sort_order?: number | null
          stripe_price_id_annually?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Update: {
          addon_type?: string
          created_at?: string
          description?: string | null
          id?: string
          is_active?: boolean | null
          is_metered?: boolean | null
          metadata?: Json | null
          name?: string
          plan_category?: string
          price_annually?: number
          price_monthly?: number
          sort_order?: number | null
          stripe_price_id_annually?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
          unit_price?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      subscription_change_history: {
        Row: {
          change_type: string
          created_at: string | null
          effective_date: string
          id: string
          initiated_by: string | null
          metadata: Json | null
          new_plan_id: string | null
          new_price: number | null
          old_plan_id: string | null
          old_price: number | null
          proration_amount: number | null
          reason: string | null
          subscription_id: string | null
        }
        Insert: {
          change_type: string
          created_at?: string | null
          effective_date: string
          id?: string
          initiated_by?: string | null
          metadata?: Json | null
          new_plan_id?: string | null
          new_price?: number | null
          old_plan_id?: string | null
          old_price?: number | null
          proration_amount?: number | null
          reason?: string | null
          subscription_id?: string | null
        }
        Update: {
          change_type?: string
          created_at?: string | null
          effective_date?: string
          id?: string
          initiated_by?: string | null
          metadata?: Json | null
          new_plan_id?: string | null
          new_price?: number | null
          old_plan_id?: string | null
          old_price?: number | null
          proration_amount?: number | null
          reason?: string | null
          subscription_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_change_history_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_coupons: {
        Row: {
          applicable_plan_ids: string[] | null
          code: string
          coupon_type: string
          created_at: string
          currency: string | null
          description: string | null
          discount_amount: number | null
          discount_percentage: number | null
          duration: string
          duration_in_months: number | null
          id: string
          is_active: boolean | null
          max_redemptions: number | null
          metadata: Json | null
          minimum_amount: number | null
          name: string
          plan_category: string | null
          stripe_coupon_id: string | null
          times_redeemed: number | null
          trial_days_extension: number | null
          updated_at: string
          valid_from: string
          valid_until: string | null
        }
        Insert: {
          applicable_plan_ids?: string[] | null
          code: string
          coupon_type: string
          created_at?: string
          currency?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          duration: string
          duration_in_months?: number | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          metadata?: Json | null
          minimum_amount?: number | null
          name: string
          plan_category?: string | null
          stripe_coupon_id?: string | null
          times_redeemed?: number | null
          trial_days_extension?: number | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Update: {
          applicable_plan_ids?: string[] | null
          code?: string
          coupon_type?: string
          created_at?: string
          currency?: string | null
          description?: string | null
          discount_amount?: number | null
          discount_percentage?: number | null
          duration?: string
          duration_in_months?: number | null
          id?: string
          is_active?: boolean | null
          max_redemptions?: number | null
          metadata?: Json | null
          minimum_amount?: number | null
          name?: string
          plan_category?: string | null
          stripe_coupon_id?: string | null
          times_redeemed?: number | null
          trial_days_extension?: number | null
          updated_at?: string
          valid_from?: string
          valid_until?: string | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          billing_interval: string | null
          created_at: string | null
          created_by_tenant_id: string | null
          description: string | null
          features: Json | null
          id: string
          is_active: boolean | null
          is_custom: boolean | null
          is_custom_plan: boolean | null
          is_public: boolean | null
          limits: Json | null
          name: string
          parent_plan_id: string | null
          plan_category: string | null
          plan_type: Database["public"]["Enums"]["subscription_plan_type"]
          price_annually: number | null
          price_monthly: number | null
          price_quarterly: number | null
          sort_order: number | null
          stripe_price_id_annually: string | null
          stripe_price_id_monthly: string | null
          stripe_product_id: string | null
          tenant_id: string | null
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          billing_interval?: string | null
          created_at?: string | null
          created_by_tenant_id?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          is_custom_plan?: boolean | null
          is_public?: boolean | null
          limits?: Json | null
          name: string
          parent_plan_id?: string | null
          plan_category?: string | null
          plan_type: Database["public"]["Enums"]["subscription_plan_type"]
          price_annually?: number | null
          price_monthly?: number | null
          price_quarterly?: number | null
          sort_order?: number | null
          stripe_price_id_annually?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
          tenant_id?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          billing_interval?: string | null
          created_at?: string | null
          created_by_tenant_id?: string | null
          description?: string | null
          features?: Json | null
          id?: string
          is_active?: boolean | null
          is_custom?: boolean | null
          is_custom_plan?: boolean | null
          is_public?: boolean | null
          limits?: Json | null
          name?: string
          parent_plan_id?: string | null
          plan_category?: string | null
          plan_type?: Database["public"]["Enums"]["subscription_plan_type"]
          price_annually?: number | null
          price_monthly?: number | null
          price_quarterly?: number | null
          sort_order?: number | null
          stripe_price_id_annually?: string | null
          stripe_price_id_monthly?: string | null
          stripe_product_id?: string | null
          tenant_id?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_plans_created_by_tenant_id_fkey"
            columns: ["created_by_tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plans_parent_plan_id_fkey"
            columns: ["parent_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_plans_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_renewals: {
        Row: {
          amount: number
          auto_renew: boolean
          created_at: string
          currency: string
          id: string
          notification_sent: boolean | null
          paypal_subscription_id: string | null
          processed_at: string | null
          renewal_date: string
          status: string
          stripe_subscription_id: string | null
          subscription_id: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          amount: number
          auto_renew?: boolean
          created_at?: string
          currency?: string
          id?: string
          notification_sent?: boolean | null
          paypal_subscription_id?: string | null
          processed_at?: string | null
          renewal_date: string
          status?: string
          stripe_subscription_id?: string | null
          subscription_id: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          amount?: number
          auto_renew?: boolean
          created_at?: string
          currency?: string
          id?: string
          notification_sent?: boolean | null
          paypal_subscription_id?: string | null
          processed_at?: string | null
          renewal_date?: string
          status?: string
          stripe_subscription_id?: string | null
          subscription_id?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_renewals_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_renewals_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_settings: {
        Row: {
          auto_billing: boolean | null
          billing_alerts: Json | null
          billing_contact: Json | null
          billing_history: Json | null
          cancellation_settings: Json | null
          created_at: string | null
          feature_limits: Json | null
          id: string
          payment_methods: Json | null
          tenant_id: string
          updated_at: string | null
          usage_quotas: Json | null
        }
        Insert: {
          auto_billing?: boolean | null
          billing_alerts?: Json | null
          billing_contact?: Json | null
          billing_history?: Json | null
          cancellation_settings?: Json | null
          created_at?: string | null
          feature_limits?: Json | null
          id?: string
          payment_methods?: Json | null
          tenant_id: string
          updated_at?: string | null
          usage_quotas?: Json | null
        }
        Update: {
          auto_billing?: boolean | null
          billing_alerts?: Json | null
          billing_contact?: Json | null
          billing_history?: Json | null
          cancellation_settings?: Json | null
          created_at?: string | null
          feature_limits?: Json | null
          id?: string
          payment_methods?: Json | null
          tenant_id?: string
          updated_at?: string | null
          usage_quotas?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "subscription_settings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscription_usage_logs: {
        Row: {
          billing_period_end: string
          billing_period_start: string
          created_at: string
          id: string
          metadata: Json | null
          metric_name: string
          quantity: number
          subscription_id: string | null
          tenant_id: string
          unit: string
          usage_date: string
        }
        Insert: {
          billing_period_end: string
          billing_period_start: string
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_name: string
          quantity: number
          subscription_id?: string | null
          tenant_id: string
          unit: string
          usage_date?: string
        }
        Update: {
          billing_period_end?: string
          billing_period_start?: string
          created_at?: string
          id?: string
          metadata?: Json | null
          metric_name?: string
          quantity?: number
          subscription_id?: string | null
          tenant_id?: string
          unit?: string
          usage_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscription_usage_logs_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "tenant_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscription_usage_logs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          activation_code_id: string | null
          amount: number
          archived: boolean | null
          auto_renew: boolean | null
          created_at: string | null
          currency: string | null
          end_date: string | null
          farmer_id: string
          id: string
          metadata: Json | null
          payment_gateway: string | null
          payment_id: string | null
          plan_id: string
          start_date: string | null
          status: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          activation_code_id?: string | null
          amount: number
          archived?: boolean | null
          auto_renew?: boolean | null
          created_at?: string | null
          currency?: string | null
          end_date?: string | null
          farmer_id: string
          id?: string
          metadata?: Json | null
          payment_gateway?: string | null
          payment_id?: string | null
          plan_id: string
          start_date?: string | null
          status?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          activation_code_id?: string | null
          amount?: number
          archived?: boolean | null
          auto_renew?: boolean | null
          created_at?: string | null
          currency?: string | null
          end_date?: string | null
          farmer_id?: string
          id?: string
          metadata?: Json | null
          payment_gateway?: string | null
          payment_id?: string | null
          plan_id?: string
          start_date?: string | null
          status?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_activation_code_id_fkey"
            columns: ["activation_code_id"]
            isOneToOne: false
            referencedRelation: "activation_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      sync_queue: {
        Row: {
          created_at: string | null
          data: Json
          entity_id: string
          entity_type: string
          id: string
          operation_type: string
          organization_id: string
          retry_count: number | null
          sync_status: string | null
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          data: Json
          entity_id: string
          entity_type: string
          id?: string
          operation_type: string
          organization_id: string
          retry_count?: number | null
          sync_status?: string | null
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          data?: Json
          entity_id?: string
          entity_type?: string
          id?: string
          operation_type?: string
          organization_id?: string
          retry_count?: number | null
          sync_status?: string | null
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      system_config: {
        Row: {
          config_key: string
          config_value: Json
          created_at: string | null
          description: string | null
          id: string
          updated_at: string | null
        }
        Insert: {
          config_key: string
          config_value: Json
          created_at?: string | null
          description?: string | null
          id?: string
          updated_at?: string | null
        }
        Update: {
          config_key?: string
          config_value?: Json
          created_at?: string | null
          description?: string | null
          id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_health_metrics: {
        Row: {
          created_at: string
          id: string
          labels: Json | null
          metric_name: string
          metric_type: string
          tenant_id: string | null
          timestamp: string
          unit: string | null
          value: number
        }
        Insert: {
          created_at?: string
          id?: string
          labels?: Json | null
          metric_name: string
          metric_type: string
          tenant_id?: string | null
          timestamp?: string
          unit?: string | null
          value: number
        }
        Update: {
          created_at?: string
          id?: string
          labels?: Json | null
          metric_name?: string
          metric_type?: string
          tenant_id?: string | null
          timestamp?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_health_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_jobs: {
        Row: {
          completed_at: string | null
          created_at: string | null
          created_by: string | null
          error_details: Json | null
          error_message: string | null
          id: string
          job_type: string
          parameters: Json | null
          progress: number | null
          result: Json | null
          started_at: string | null
          status: string
          target_id: string | null
          target_type: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          job_type: string
          parameters?: Json | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          created_by?: string | null
          error_details?: Json | null
          error_message?: string | null
          id?: string
          job_type?: string
          parameters?: Json | null
          progress?: number | null
          result?: Json | null
          started_at?: string | null
          status?: string
          target_id?: string | null
          target_type?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_metrics: {
        Row: {
          created_at: string | null
          id: string
          labels: Json | null
          metadata: Json | null
          metric_name: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          tenant_id: string | null
          timestamp: string
          unit: string | null
          value: number
        }
        Insert: {
          created_at?: string | null
          id?: string
          labels?: Json | null
          metadata?: Json | null
          metric_name: string
          metric_type: Database["public"]["Enums"]["metric_type"]
          tenant_id?: string | null
          timestamp?: string
          unit?: string | null
          value: number
        }
        Update: {
          created_at?: string | null
          id?: string
          labels?: Json | null
          metadata?: Json | null
          metric_name?: string
          metric_type?: Database["public"]["Enums"]["metric_type"]
          tenant_id?: string | null
          timestamp?: string
          unit?: string | null
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "system_metrics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      system_roles: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          is_system_role: boolean | null
          permissions: Json | null
          role_code: string
          role_description: string | null
          role_level: number
          role_name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          permissions?: Json | null
          role_code: string
          role_description?: string | null
          role_level?: number
          role_name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          is_system_role?: boolean | null
          permissions?: Json | null
          role_code?: string
          role_description?: string | null
          role_level?: number
          role_name?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      system_satellite_config: {
        Row: {
          auto_switch_on_failure: boolean | null
          copernicus_client_id: string | null
          copernicus_client_secret: string | null
          created_at: string | null
          fallback_enabled: boolean | null
          id: string
          max_retries_per_source: number | null
          preferred_api_source: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          auto_switch_on_failure?: boolean | null
          copernicus_client_id?: string | null
          copernicus_client_secret?: string | null
          created_at?: string | null
          fallback_enabled?: boolean | null
          id?: string
          max_retries_per_source?: number | null
          preferred_api_source?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          auto_switch_on_failure?: boolean | null
          copernicus_client_id?: string | null
          copernicus_client_secret?: string | null
          created_at?: string | null
          fallback_enabled?: boolean | null
          id?: string
          max_retries_per_source?: number | null
          preferred_api_source?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "system_satellite_config_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      talukas: {
        Row: {
          created_at: string | null
          district_id: string
          id: string
          is_active: boolean | null
          name: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          district_id: string
          id?: string
          is_active?: boolean | null
          name: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          district_id?: string
          id?: string
          is_active?: boolean | null
          name?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "talukas_district_id_fkey"
            columns: ["district_id"]
            isOneToOne: false
            referencedRelation: "districts"
            referencedColumns: ["id"]
          },
        ]
      }
      task_completions: {
        Row: {
          action: string
          action_date: string | null
          actual_cost: number | null
          actual_resources: Json | null
          created_at: string | null
          difficulty_rating: number | null
          effectiveness_rating: number | null
          farmer_id: string
          id: string
          notes: string | null
          photos: string[] | null
          task_id: string
          weather_conditions: Json | null
        }
        Insert: {
          action: string
          action_date?: string | null
          actual_cost?: number | null
          actual_resources?: Json | null
          created_at?: string | null
          difficulty_rating?: number | null
          effectiveness_rating?: number | null
          farmer_id: string
          id?: string
          notes?: string | null
          photos?: string[] | null
          task_id: string
          weather_conditions?: Json | null
        }
        Update: {
          action?: string
          action_date?: string | null
          actual_cost?: number | null
          actual_resources?: Json | null
          created_at?: string | null
          difficulty_rating?: number | null
          effectiveness_rating?: number | null
          farmer_id?: string
          id?: string
          notes?: string | null
          photos?: string[] | null
          task_id?: string
          weather_conditions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "farmer_upcoming_needs"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_completions_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_notifications: {
        Row: {
          created_at: string | null
          id: string
          notification_type: string
          opened_at: string | null
          scheduled_for: string
          sent_at: string | null
          status: string | null
          task_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          notification_type: string
          opened_at?: string | null
          scheduled_for: string
          sent_at?: string | null
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          notification_type?: string
          opened_at?: string | null
          scheduled_for?: string
          sent_at?: string | null
          status?: string | null
          task_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "farmer_upcoming_needs"
            referencedColumns: ["task_id"]
          },
          {
            foreignKeyName: "task_notifications_task_id_fkey"
            columns: ["task_id"]
            isOneToOne: false
            referencedRelation: "schedule_tasks"
            referencedColumns: ["id"]
          },
        ]
      }
      task_product_mappings: {
        Row: {
          created_at: string | null
          id: string
          product_category: string | null
          product_type: string
          quantity_multiplier: number | null
          recommended_product_ids: string[] | null
          task_type: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          product_category?: string | null
          product_type: string
          quantity_multiplier?: number | null
          recommended_product_ids?: string[] | null
          task_type: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          product_category?: string | null
          product_type?: string
          quantity_multiplier?: number | null
          recommended_product_ids?: string[] | null
          task_type?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "task_product_mappings_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tax_configurations: {
        Row: {
          country_code: string
          created_at: string | null
          id: string
          is_active: boolean | null
          metadata: Json | null
          region: string | null
          reverse_charge_applicable: boolean | null
          tax_id_required: boolean | null
          tax_rate: number
          tax_type: string
          updated_at: string | null
        }
        Insert: {
          country_code: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          region?: string | null
          reverse_charge_applicable?: boolean | null
          tax_id_required?: boolean | null
          tax_rate: number
          tax_type: string
          updated_at?: string | null
        }
        Update: {
          country_code?: string
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          metadata?: Json | null
          region?: string | null
          reverse_charge_applicable?: boolean | null
          tax_id_required?: boolean | null
          tax_rate?: number
          tax_type?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      team_invitations: {
        Row: {
          accepted_at: string | null
          created_at: string | null
          email: string
          expires_at: string | null
          first_name: string | null
          id: string
          invitation_token: string
          invited_by: string | null
          inviter_name: string | null
          last_name: string | null
          role: string
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
          updated_at: string | null
        }
        Insert: {
          accepted_at?: string | null
          created_at?: string | null
          email: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          invitation_token: string
          invited_by?: string | null
          inviter_name?: string | null
          last_name?: string | null
          role: string
          status?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
        }
        Update: {
          accepted_at?: string | null
          created_at?: string | null
          email?: string
          expires_at?: string | null
          first_name?: string | null
          id?: string
          invitation_token?: string
          invited_by?: string | null
          inviter_name?: string | null
          last_name?: string | null
          role?: string
          status?: string | null
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "team_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      team_messages: {
        Row: {
          channel_id: string
          content: string
          created_at: string | null
          edited_at: string | null
          id: string
          is_edited: boolean | null
          is_pinned: boolean | null
          message_type: string
          metadata: Json | null
          organization_id: string
          reply_to_id: string | null
          sender_id: string
          updated_at: string | null
        }
        Insert: {
          channel_id: string
          content: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
          is_pinned?: boolean | null
          message_type?: string
          metadata?: Json | null
          organization_id: string
          reply_to_id?: string | null
          sender_id: string
          updated_at?: string | null
        }
        Update: {
          channel_id?: string
          content?: string
          created_at?: string | null
          edited_at?: string | null
          id?: string
          is_edited?: boolean | null
          is_pinned?: boolean | null
          message_type?: string
          metadata?: Json | null
          organization_id?: string
          reply_to_id?: string | null
          sender_id?: string
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_archive_jobs: {
        Row: {
          archive_location: string
          archived_at: string | null
          created_at: string | null
          encryption_key_id: string
          id: string
          reactivated_at: string | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          archive_location: string
          archived_at?: string | null
          created_at?: string | null
          encryption_key_id: string
          id?: string
          reactivated_at?: string | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          archive_location?: string
          archived_at?: string | null
          created_at?: string | null
          encryption_key_id?: string
          id?: string
          reactivated_at?: string | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_archive_jobs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_branding: {
        Row: {
          accent_color: string | null
          app_icon_url: string | null
          app_name: string | null
          app_tagline: string | null
          background_color: string | null
          company_description: string | null
          created_at: string | null
          custom_css: string | null
          email_footer_html: string | null
          email_header_html: string | null
          favicon_url: string | null
          font_family: string | null
          id: string
          logo_url: string | null
          primary_color: string | null
          secondary_color: string | null
          settings: Json | null
          splash_screen_url: string | null
          tenant_id: string | null
          text_color: string | null
          updated_at: string | null
          version: number | null
        }
        Insert: {
          accent_color?: string | null
          app_icon_url?: string | null
          app_name?: string | null
          app_tagline?: string | null
          background_color?: string | null
          company_description?: string | null
          created_at?: string | null
          custom_css?: string | null
          email_footer_html?: string | null
          email_header_html?: string | null
          favicon_url?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json | null
          splash_screen_url?: string | null
          tenant_id?: string | null
          text_color?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Update: {
          accent_color?: string | null
          app_icon_url?: string | null
          app_name?: string | null
          app_tagline?: string | null
          background_color?: string | null
          company_description?: string | null
          created_at?: string | null
          custom_css?: string | null
          email_footer_html?: string | null
          email_header_html?: string | null
          favicon_url?: string | null
          font_family?: string | null
          id?: string
          logo_url?: string | null
          primary_color?: string | null
          secondary_color?: string | null
          settings?: Json | null
          splash_screen_url?: string | null
          tenant_id?: string | null
          text_color?: string | null
          updated_at?: string | null
          version?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_branding_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_creation_requests: {
        Row: {
          admin_id: string | null
          completed_at: string | null
          created_at: string
          error_details: Json | null
          id: string
          idempotency_key: string
          request_data: Json
          status: string
          tenant_id: string | null
        }
        Insert: {
          admin_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          id?: string
          idempotency_key: string
          request_data?: Json
          status?: string
          tenant_id?: string | null
        }
        Update: {
          admin_id?: string | null
          completed_at?: string | null
          created_at?: string
          error_details?: Json | null
          id?: string
          idempotency_key?: string
          request_data?: Json
          status?: string
          tenant_id?: string | null
        }
        Relationships: []
      }
      tenant_detection_events: {
        Row: {
          created_at: string
          detection_method: string | null
          domain: string
          error_details: Json | null
          event_type: string
          fallback_reason: string | null
          id: string
          ip_address: unknown
          metadata: Json | null
          session_id: string | null
          tenant_id: string | null
          timestamp: string
          user_agent: string | null
        }
        Insert: {
          created_at?: string
          detection_method?: string | null
          domain: string
          error_details?: Json | null
          event_type: string
          fallback_reason?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Update: {
          created_at?: string
          detection_method?: string | null
          domain?: string
          error_details?: Json | null
          event_type?: string
          fallback_reason?: string | null
          id?: string
          ip_address?: unknown
          metadata?: Json | null
          session_id?: string | null
          tenant_id?: string | null
          timestamp?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      tenant_domains: {
        Row: {
          created_at: string | null
          custom_domain: string | null
          dns_records: Json | null
          domain_verified: boolean | null
          id: string
          ssl_enabled: boolean | null
          subdomain: string | null
          tenant_id: string
          updated_at: string | null
          verification_token: string | null
          whitelabel_config: Json | null
        }
        Insert: {
          created_at?: string | null
          custom_domain?: string | null
          dns_records?: Json | null
          domain_verified?: boolean | null
          id?: string
          ssl_enabled?: boolean | null
          subdomain?: string | null
          tenant_id: string
          updated_at?: string | null
          verification_token?: string | null
          whitelabel_config?: Json | null
        }
        Update: {
          created_at?: string | null
          custom_domain?: string | null
          dns_records?: Json | null
          domain_verified?: boolean | null
          id?: string
          ssl_enabled?: boolean | null
          subdomain?: string | null
          tenant_id?: string
          updated_at?: string | null
          verification_token?: string | null
          whitelabel_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_domains_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_farmer_pricing: {
        Row: {
          base_plan_id: string
          created_at: string | null
          custom_features: Json | null
          custom_limits: Json | null
          custom_price_annually: number | null
          custom_price_monthly: number | null
          custom_price_quarterly: number | null
          id: string
          is_active: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          base_plan_id: string
          created_at?: string | null
          custom_features?: Json | null
          custom_limits?: Json | null
          custom_price_annually?: number | null
          custom_price_monthly?: number | null
          custom_price_quarterly?: number | null
          id?: string
          is_active?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          base_plan_id?: string
          created_at?: string | null
          custom_features?: Json | null
          custom_limits?: Json | null
          custom_price_annually?: number | null
          custom_price_monthly?: number | null
          custom_price_quarterly?: number | null
          id?: string
          is_active?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_farmer_pricing_base_plan_id_fkey"
            columns: ["base_plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_farmer_pricing_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_feature_overrides: {
        Row: {
          created_at: string | null
          created_by: string | null
          expires_at: string | null
          flag_id: string | null
          id: string
          override_enabled: boolean
          override_reason: string | null
          tenant_id: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          flag_id?: string | null
          id?: string
          override_enabled: boolean
          override_reason?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expires_at?: string | null
          flag_id?: string | null
          id?: string
          override_enabled?: boolean
          override_reason?: string | null
          tenant_id?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_feature_overrides_flag_id_fkey"
            columns: ["flag_id"]
            isOneToOne: false
            referencedRelation: "feature_flags"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_feature_overrides_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_features: {
        Row: {
          advanced_analytics: boolean | null
          ai_chat: boolean | null
          api_access: boolean | null
          basic_analytics: boolean | null
          community_forum: boolean | null
          created_at: string | null
          custom_reports: boolean | null
          drone_monitoring: boolean | null
          ecommerce: boolean | null
          farmer_management: boolean | null
          id: string
          inventory_management: boolean | null
          iot_integration: boolean | null
          logistics_tracking: boolean | null
          marketplace: boolean | null
          mobile_app: boolean | null
          payment_gateway: boolean | null
          predictive_analytics: boolean | null
          promo_enabled: boolean | null
          satellite_imagery: boolean | null
          sms_notifications: boolean | null
          soil_testing: boolean | null
          tenant_id: string | null
          third_party_integrations: boolean | null
          updated_at: string | null
          voice_calls: boolean | null
          weather_forecast: boolean | null
          webhook_support: boolean | null
          whatsapp_integration: boolean | null
          white_label_mobile_app: boolean | null
        }
        Insert: {
          advanced_analytics?: boolean | null
          ai_chat?: boolean | null
          api_access?: boolean | null
          basic_analytics?: boolean | null
          community_forum?: boolean | null
          created_at?: string | null
          custom_reports?: boolean | null
          drone_monitoring?: boolean | null
          ecommerce?: boolean | null
          farmer_management?: boolean | null
          id?: string
          inventory_management?: boolean | null
          iot_integration?: boolean | null
          logistics_tracking?: boolean | null
          marketplace?: boolean | null
          mobile_app?: boolean | null
          payment_gateway?: boolean | null
          predictive_analytics?: boolean | null
          promo_enabled?: boolean | null
          satellite_imagery?: boolean | null
          sms_notifications?: boolean | null
          soil_testing?: boolean | null
          tenant_id?: string | null
          third_party_integrations?: boolean | null
          updated_at?: string | null
          voice_calls?: boolean | null
          weather_forecast?: boolean | null
          webhook_support?: boolean | null
          whatsapp_integration?: boolean | null
          white_label_mobile_app?: boolean | null
        }
        Update: {
          advanced_analytics?: boolean | null
          ai_chat?: boolean | null
          api_access?: boolean | null
          basic_analytics?: boolean | null
          community_forum?: boolean | null
          created_at?: string | null
          custom_reports?: boolean | null
          drone_monitoring?: boolean | null
          ecommerce?: boolean | null
          farmer_management?: boolean | null
          id?: string
          inventory_management?: boolean | null
          iot_integration?: boolean | null
          logistics_tracking?: boolean | null
          marketplace?: boolean | null
          mobile_app?: boolean | null
          payment_gateway?: boolean | null
          predictive_analytics?: boolean | null
          promo_enabled?: boolean | null
          satellite_imagery?: boolean | null
          sms_notifications?: boolean | null
          soil_testing?: boolean | null
          tenant_id?: string | null
          third_party_integrations?: boolean | null
          updated_at?: string | null
          voice_calls?: boolean | null
          weather_forecast?: boolean | null
          webhook_support?: boolean | null
          whatsapp_integration?: boolean | null
          white_label_mobile_app?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_features_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_legal_documents: {
        Row: {
          created_at: string
          document_name: string
          document_type: Database["public"]["Enums"]["legal_document_type"]
          expiry_date: string | null
          file_size: number
          file_url: string
          id: string
          is_required: boolean
          metadata: Json | null
          mime_type: string
          original_filename: string
          rejection_reason: string | null
          tenant_id: string
          updated_at: string
          upload_order: number
          verification_status: Database["public"]["Enums"]["verification_status"]
          verified_at: string | null
          verified_by: string | null
        }
        Insert: {
          created_at?: string
          document_name: string
          document_type: Database["public"]["Enums"]["legal_document_type"]
          expiry_date?: string | null
          file_size: number
          file_url: string
          id?: string
          is_required?: boolean
          metadata?: Json | null
          mime_type?: string
          original_filename: string
          rejection_reason?: string | null
          tenant_id: string
          updated_at?: string
          upload_order?: number
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Update: {
          created_at?: string
          document_name?: string
          document_type?: Database["public"]["Enums"]["legal_document_type"]
          expiry_date?: string | null
          file_size?: number
          file_url?: string
          id?: string
          is_required?: boolean
          metadata?: Json | null
          mime_type?: string
          original_filename?: string
          rejection_reason?: string | null
          tenant_id?: string
          updated_at?: string
          upload_order?: number
          verification_status?: Database["public"]["Enums"]["verification_status"]
          verified_at?: string | null
          verified_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_legal_documents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_legal_documents_verified_by_fkey"
            columns: ["verified_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_onboarding_status: {
        Row: {
          billing_completed: boolean | null
          branding_completed: boolean | null
          company_profile_completed: boolean | null
          created_at: string | null
          domain_completed: boolean | null
          id: string
          overall_completion_percentage: number | null
          review_completed: boolean | null
          tenant_id: string
          updated_at: string | null
          users_roles_completed: boolean | null
          workflow_id: string | null
        }
        Insert: {
          billing_completed?: boolean | null
          branding_completed?: boolean | null
          company_profile_completed?: boolean | null
          created_at?: string | null
          domain_completed?: boolean | null
          id?: string
          overall_completion_percentage?: number | null
          review_completed?: boolean | null
          tenant_id: string
          updated_at?: string | null
          users_roles_completed?: boolean | null
          workflow_id?: string | null
        }
        Update: {
          billing_completed?: boolean | null
          branding_completed?: boolean | null
          company_profile_completed?: boolean | null
          created_at?: string | null
          domain_completed?: boolean | null
          id?: string
          overall_completion_percentage?: number | null
          review_completed?: boolean | null
          tenant_id?: string
          updated_at?: string | null
          users_roles_completed?: boolean | null
          workflow_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_onboarding_status_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_onboarding_status_workflow_id_fkey"
            columns: ["workflow_id"]
            isOneToOne: false
            referencedRelation: "onboarding_workflows"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_promos: {
        Row: {
          created_at: string | null
          description: string | null
          duration: number
          end_date: string
          id: string
          is_active: boolean
          language: string | null
          metadata: Json | null
          promo_type: string
          promo_url: string
          start_date: string
          tenant_id: string
          title: string | null
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          duration?: number
          end_date: string
          id?: string
          is_active?: boolean
          language?: string | null
          metadata?: Json | null
          promo_type: string
          promo_url: string
          start_date: string
          tenant_id: string
          title?: string | null
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          duration?: number
          end_date?: string
          id?: string
          is_active?: boolean
          language?: string | null
          metadata?: Json | null
          promo_type?: string
          promo_url?: string
          start_date?: string
          tenant_id?: string
          title?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      tenant_subscriptions: {
        Row: {
          auto_renew: boolean | null
          billing_address: Json | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancellation_feedback: string | null
          cancellation_reason: string | null
          created_at: string | null
          current_period_end: string | null
          current_period_start: string | null
          grace_period_ends_at: string | null
          id: string
          last_payment_amount: number | null
          last_payment_date: string | null
          metadata: Json | null
          next_billing_date: string | null
          payment_method: Json | null
          payment_method_id: string | null
          plan_id: string | null
          status: string | null
          stripe_customer_id: string | null
          stripe_subscription_id: string | null
          tenant_id: string | null
          trial_days: number | null
          updated_at: string | null
        }
        Insert: {
          auto_renew?: boolean | null
          billing_address?: Json | null
          billing_interval: Database["public"]["Enums"]["billing_interval"]
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_ends_at?: string | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          next_billing_date?: string | null
          payment_method?: Json | null
          payment_method_id?: string | null
          plan_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Update: {
          auto_renew?: boolean | null
          billing_address?: Json | null
          billing_interval?: Database["public"]["Enums"]["billing_interval"]
          cancellation_feedback?: string | null
          cancellation_reason?: string | null
          created_at?: string | null
          current_period_end?: string | null
          current_period_start?: string | null
          grace_period_ends_at?: string | null
          id?: string
          last_payment_amount?: number | null
          last_payment_date?: string | null
          metadata?: Json | null
          next_billing_date?: string | null
          payment_method?: Json | null
          payment_method_id?: string | null
          plan_id?: string | null
          status?: string | null
          stripe_customer_id?: string | null
          stripe_subscription_id?: string | null
          tenant_id?: string | null
          trial_days?: number | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "subscription_plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tenant_subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenant_wallets: {
        Row: {
          auto_topup_amount: number | null
          auto_topup_enabled: boolean | null
          auto_topup_threshold: number | null
          balance: number | null
          created_at: string | null
          currency: string | null
          id: string
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          auto_topup_amount?: number | null
          auto_topup_enabled?: boolean | null
          auto_topup_threshold?: number | null
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          auto_topup_amount?: number | null
          auto_topup_enabled?: boolean | null
          auto_topup_threshold?: number | null
          balance?: number | null
          created_at?: string | null
          currency?: string | null
          id?: string
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "tenant_wallets_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      tenants: {
        Row: {
          activated_at: string | null
          archived: boolean | null
          archived_at: string | null
          bank_details: Json | null
          billing_address: Json | null
          billing_email: string | null
          branding_updated_at: string | null
          branding_version: number | null
          business_address: Json | null
          business_registration: string | null
          commission_rate: number | null
          created_at: string | null
          created_by: string | null
          custom_domain: string | null
          deleted_at: string | null
          domain_config: Json | null
          established_date: string | null
          id: string
          is_default: boolean | null
          kyc_documents: Json | null
          kyc_status: string | null
          max_api_calls_per_day: number | null
          max_dealers: number | null
          max_farmers: number | null
          max_products: number | null
          max_storage_gb: number | null
          metadata: Json | null
          name: string
          onboarding_completed: boolean | null
          onboarding_completed_at: string | null
          owner_email: string | null
          owner_name: string | null
          owner_phone: string | null
          payment_terms: string | null
          payout_method: string | null
          reactivated_at: string | null
          settings: Json | null
          slug: string
          status: Database["public"]["Enums"]["tenant_status"] | null
          stripe_customer_id: string | null
          subdomain: string | null
          subscription_end_date: string | null
          subscription_plan:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_start_date: string | null
          suspended_at: string | null
          tax_id: string | null
          trial_ends_at: string | null
          type: Database["public"]["Enums"]["tenant_type"]
          updated_at: string | null
          updated_by: string | null
        }
        Insert: {
          activated_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
          bank_details?: Json | null
          billing_address?: Json | null
          billing_email?: string | null
          branding_updated_at?: string | null
          branding_version?: number | null
          business_address?: Json | null
          business_registration?: string | null
          commission_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_domain?: string | null
          deleted_at?: string | null
          domain_config?: Json | null
          established_date?: string | null
          id?: string
          is_default?: boolean | null
          kyc_documents?: Json | null
          kyc_status?: string | null
          max_api_calls_per_day?: number | null
          max_dealers?: number | null
          max_farmers?: number | null
          max_products?: number | null
          max_storage_gb?: number | null
          metadata?: Json | null
          name: string
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          payment_terms?: string | null
          payout_method?: string | null
          reactivated_at?: string | null
          settings?: Json | null
          slug: string
          status?: Database["public"]["Enums"]["tenant_status"] | null
          stripe_customer_id?: string | null
          subdomain?: string | null
          subscription_end_date?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_start_date?: string | null
          suspended_at?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          type: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Update: {
          activated_at?: string | null
          archived?: boolean | null
          archived_at?: string | null
          bank_details?: Json | null
          billing_address?: Json | null
          billing_email?: string | null
          branding_updated_at?: string | null
          branding_version?: number | null
          business_address?: Json | null
          business_registration?: string | null
          commission_rate?: number | null
          created_at?: string | null
          created_by?: string | null
          custom_domain?: string | null
          deleted_at?: string | null
          domain_config?: Json | null
          established_date?: string | null
          id?: string
          is_default?: boolean | null
          kyc_documents?: Json | null
          kyc_status?: string | null
          max_api_calls_per_day?: number | null
          max_dealers?: number | null
          max_farmers?: number | null
          max_products?: number | null
          max_storage_gb?: number | null
          metadata?: Json | null
          name?: string
          onboarding_completed?: boolean | null
          onboarding_completed_at?: string | null
          owner_email?: string | null
          owner_name?: string | null
          owner_phone?: string | null
          payment_terms?: string | null
          payout_method?: string | null
          reactivated_at?: string | null
          settings?: Json | null
          slug?: string
          status?: Database["public"]["Enums"]["tenant_status"] | null
          stripe_customer_id?: string | null
          subdomain?: string | null
          subscription_end_date?: string | null
          subscription_plan?:
            | Database["public"]["Enums"]["subscription_plan"]
            | null
          subscription_start_date?: string | null
          suspended_at?: string | null
          tax_id?: string | null
          trial_ends_at?: string | null
          type?: Database["public"]["Enums"]["tenant_type"]
          updated_at?: string | null
          updated_by?: string | null
        }
        Relationships: []
      }
      tile_marking_progress: {
        Row: {
          completed_at: string | null
          created_at: string | null
          current_land_id: string | null
          current_step: string | null
          errors: Json | null
          execution_id: string
          id: string
          marked_tiles_count: number | null
          processed_lands: number | null
          started_at: string | null
          status: string | null
          total_lands: number | null
          updated_at: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string | null
          current_land_id?: string | null
          current_step?: string | null
          errors?: Json | null
          execution_id: string
          id?: string
          marked_tiles_count?: number | null
          processed_lands?: number | null
          started_at?: string | null
          status?: string | null
          total_lands?: number | null
          updated_at?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string | null
          current_land_id?: string | null
          current_step?: string | null
          errors?: Json | null
          execution_id?: string
          id?: string
          marked_tiles_count?: number | null
          processed_lands?: number | null
          started_at?: string | null
          status?: string | null
          total_lands?: number | null
          updated_at?: string | null
        }
        Relationships: []
      }
      transactions: {
        Row: {
          amount: number
          archived: boolean | null
          created_at: string | null
          currency: string | null
          failure_reason: string | null
          farmer_id: string | null
          gateway: string
          gateway_response: Json | null
          gateway_txn_id: string | null
          id: string
          metadata: Json | null
          payment_intent_id: string | null
          payment_method: string | null
          payment_mode: string | null
          processed_at: string | null
          refund_amount: number | null
          refunded_at: string | null
          status: string | null
          subscription_id: string | null
          tenant_id: string
          updated_at: string | null
          virtual_mode: boolean | null
        }
        Insert: {
          amount: number
          archived?: boolean | null
          created_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          farmer_id?: string | null
          gateway: string
          gateway_response?: Json | null
          gateway_txn_id?: string | null
          id?: string
          metadata?: Json | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_mode?: string | null
          processed_at?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id: string
          updated_at?: string | null
          virtual_mode?: boolean | null
        }
        Update: {
          amount?: number
          archived?: boolean | null
          created_at?: string | null
          currency?: string | null
          failure_reason?: string | null
          farmer_id?: string | null
          gateway?: string
          gateway_response?: Json | null
          gateway_txn_id?: string | null
          id?: string
          metadata?: Json | null
          payment_intent_id?: string | null
          payment_method?: string | null
          payment_mode?: string | null
          processed_at?: string | null
          refund_amount?: number | null
          refunded_at?: string | null
          status?: string | null
          subscription_id?: string | null
          tenant_id?: string
          updated_at?: string | null
          virtual_mode?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "transactions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "active_subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_subscription_id_fkey"
            columns: ["subscription_id"]
            isOneToOne: false
            referencedRelation: "subscriptions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "transactions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      treatment_outcomes: {
        Row: {
          application_date: string | null
          benefit_actual_inr: number | null
          benefit_predicted_inr: number | null
          cost_actual_inr: number | null
          cost_predicted_inr: number | null
          created_at: string | null
          day_14_check: Json | null
          day_3_check: Json | null
          day_7_check: Json | null
          decision_id: string | null
          deviations: string[] | null
          efficacy_predicted_percent: number | null
          expert_diagnosis_correct: boolean | null
          expert_notes: string | null
          expert_review_date: string | null
          expert_reviewed: boolean | null
          expert_treatment_appropriate: boolean | null
          farmer_id: string | null
          farmer_implemented: boolean | null
          farmer_satisfaction: number | null
          farmer_would_recommend: boolean | null
          final_outcome: string | null
          followed_instructions: boolean | null
          id: string
          land_id: string | null
          predicted_pest_disease: string | null
          prediction_confidence: number | null
          session_id: string | null
          tenant_id: string | null
          treatment_applied: string | null
          treatment_recommended: string | null
          updated_at: string | null
        }
        Insert: {
          application_date?: string | null
          benefit_actual_inr?: number | null
          benefit_predicted_inr?: number | null
          cost_actual_inr?: number | null
          cost_predicted_inr?: number | null
          created_at?: string | null
          day_14_check?: Json | null
          day_3_check?: Json | null
          day_7_check?: Json | null
          decision_id?: string | null
          deviations?: string[] | null
          efficacy_predicted_percent?: number | null
          expert_diagnosis_correct?: boolean | null
          expert_notes?: string | null
          expert_review_date?: string | null
          expert_reviewed?: boolean | null
          expert_treatment_appropriate?: boolean | null
          farmer_id?: string | null
          farmer_implemented?: boolean | null
          farmer_satisfaction?: number | null
          farmer_would_recommend?: boolean | null
          final_outcome?: string | null
          followed_instructions?: boolean | null
          id?: string
          land_id?: string | null
          predicted_pest_disease?: string | null
          prediction_confidence?: number | null
          session_id?: string | null
          tenant_id?: string | null
          treatment_applied?: string | null
          treatment_recommended?: string | null
          updated_at?: string | null
        }
        Update: {
          application_date?: string | null
          benefit_actual_inr?: number | null
          benefit_predicted_inr?: number | null
          cost_actual_inr?: number | null
          cost_predicted_inr?: number | null
          created_at?: string | null
          day_14_check?: Json | null
          day_3_check?: Json | null
          day_7_check?: Json | null
          decision_id?: string | null
          deviations?: string[] | null
          efficacy_predicted_percent?: number | null
          expert_diagnosis_correct?: boolean | null
          expert_notes?: string | null
          expert_review_date?: string | null
          expert_reviewed?: boolean | null
          expert_treatment_appropriate?: boolean | null
          farmer_id?: string | null
          farmer_implemented?: boolean | null
          farmer_satisfaction?: number | null
          farmer_would_recommend?: boolean | null
          final_outcome?: string | null
          followed_instructions?: boolean | null
          id?: string
          land_id?: string | null
          predicted_pest_disease?: string | null
          prediction_confidence?: number | null
          session_id?: string | null
          tenant_id?: string | null
          treatment_applied?: string | null
          treatment_recommended?: string | null
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "treatment_outcomes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_outcomes_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "treatment_outcomes_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "treatment_outcomes_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "treatment_outcomes_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "treatment_outcomes_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "treatment_outcomes_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "treatment_outcomes_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "treatment_outcomes_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      trending_topics: {
        Row: {
          crop_id: string | null
          engagement_score: number | null
          hashtag: string
          id: string
          last_updated: string | null
          post_count: number | null
          region: string | null
          tenant_id: string | null
          trending_since: string | null
        }
        Insert: {
          crop_id?: string | null
          engagement_score?: number | null
          hashtag: string
          id?: string
          last_updated?: string | null
          post_count?: number | null
          region?: string | null
          tenant_id?: string | null
          trending_since?: string | null
        }
        Update: {
          crop_id?: string | null
          engagement_score?: number | null
          hashtag?: string
          id?: string
          last_updated?: string | null
          post_count?: number | null
          region?: string | null
          tenant_id?: string | null
          trending_since?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "trending_topics_crop_id_fkey"
            columns: ["crop_id"]
            isOneToOne: false
            referencedRelation: "crops"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "trending_topics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_analytics: {
        Row: {
          created_at: string | null
          endpoint_path: string | null
          feature_name: string
          id: string
          metadata: Json | null
          response_time_ms: number | null
          session_duration: unknown
          status_code: number | null
          tenant_id: string | null
          timestamp: string
          usage_count: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          endpoint_path?: string | null
          feature_name: string
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          session_duration?: unknown
          status_code?: number | null
          tenant_id?: string | null
          timestamp?: string
          usage_count?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          endpoint_path?: string | null
          feature_name?: string
          id?: string
          metadata?: Json | null
          response_time_ms?: number | null
          session_duration?: unknown
          status_code?: number | null
          tenant_id?: string | null
          timestamp?: string
          usage_count?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_analytics_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_badges: {
        Row: {
          badge_category: string
          badge_icon_url: string | null
          badge_name: string
          badge_type: string
          earned_at: string | null
          farmer_id: string
          id: string
        }
        Insert: {
          badge_category: string
          badge_icon_url?: string | null
          badge_name: string
          badge_type: string
          earned_at?: string | null
          farmer_id: string
          id?: string
        }
        Update: {
          badge_category?: string
          badge_icon_url?: string | null
          badge_name?: string
          badge_type?: string
          earned_at?: string | null
          farmer_id?: string
          id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_badges_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_badges_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      user_invitations: {
        Row: {
          accepted_at: string | null
          clicked_at: string | null
          created_at: string | null
          created_by: string | null
          email: string
          expires_at: string
          first_name: string | null
          id: string
          invitation_token: string
          invitation_type: string
          invited_by: string | null
          inviter_name: string | null
          last_name: string | null
          metadata: Json | null
          role: string | null
          sent_at: string | null
          status: string
          tenant_id: string | null
          tenant_name: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          accepted_at?: string | null
          clicked_at?: string | null
          created_at?: string | null
          created_by?: string | null
          email: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invitation_token?: string
          invitation_type?: string
          invited_by?: string | null
          inviter_name?: string | null
          last_name?: string | null
          metadata?: Json | null
          role?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          accepted_at?: string | null
          clicked_at?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string
          expires_at?: string
          first_name?: string | null
          id?: string
          invitation_token?: string
          invitation_type?: string
          invited_by?: string | null
          inviter_name?: string | null
          last_name?: string | null
          metadata?: Json | null
          role?: string | null
          sent_at?: string | null
          status?: string
          tenant_id?: string | null
          tenant_name?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_invitations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "admin_users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_invitations_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      user_points: {
        Row: {
          description: string | null
          earned_at: string | null
          farmer_id: string
          id: string
          points: number
          points_type: string
          reference_id: string | null
        }
        Insert: {
          description?: string | null
          earned_at?: string | null
          farmer_id: string
          id?: string
          points: number
          points_type: string
          reference_id?: string | null
        }
        Update: {
          description?: string | null
          earned_at?: string | null
          farmer_id?: string
          id?: string
          points?: number
          points_type?: string
          reference_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_points_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_points_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      user_presence: {
        Row: {
          created_at: string | null
          current_location: Json | null
          id: string
          last_seen: string | null
          metadata: Json | null
          organization_id: string
          status: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          current_location?: Json | null
          id?: string
          last_seen?: string | null
          metadata?: Json | null
          organization_id: string
          status?: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          current_location?: Json | null
          id?: string
          last_seen?: string | null
          metadata?: Json | null
          organization_id?: string
          status?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_profiles: {
        Row: {
          aadhaar_number: string | null
          address_line1: string | null
          address_line2: string | null
          annual_income_range: string | null
          avatar_url: string | null
          bio: string | null
          coordinates: unknown
          country: string | null
          created_at: string | null
          date_of_birth: string | null
          device_tokens: Json | null
          display_name: string | null
          district: string | null
          email: string | null
          email_verified_at: string | null
          expertise_areas: string[] | null
          farmer_code: string | null
          farmer_id: string
          farming_experience_years: number | null
          full_name: string | null
          gender: string | null
          has_irrigation: boolean | null
          has_storage: boolean | null
          has_tractor: boolean | null
          id: string
          is_account_locked: boolean | null
          is_profile_complete: boolean | null
          last_active_at: string | null
          metadata: Json | null
          mobile_number: string | null
          notification_preferences: Json | null
          password_changed_at: string | null
          phone_verified: boolean | null
          pincode: string | null
          preferred_language:
            | Database["public"]["Enums"]["language_code"]
            | null
          primary_crops: string[] | null
          shc_id: string | null
          state: string | null
          taluka: string | null
          tenant_id: string | null
          total_land_acres: number | null
          updated_at: string | null
          village: string | null
        }
        Insert: {
          aadhaar_number?: string | null
          address_line1?: string | null
          address_line2?: string | null
          annual_income_range?: string | null
          avatar_url?: string | null
          bio?: string | null
          coordinates?: unknown
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          device_tokens?: Json | null
          display_name?: string | null
          district?: string | null
          email?: string | null
          email_verified_at?: string | null
          expertise_areas?: string[] | null
          farmer_code?: string | null
          farmer_id: string
          farming_experience_years?: number | null
          full_name?: string | null
          gender?: string | null
          has_irrigation?: boolean | null
          has_storage?: boolean | null
          has_tractor?: boolean | null
          id: string
          is_account_locked?: boolean | null
          is_profile_complete?: boolean | null
          last_active_at?: string | null
          metadata?: Json | null
          mobile_number?: string | null
          notification_preferences?: Json | null
          password_changed_at?: string | null
          phone_verified?: boolean | null
          pincode?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          primary_crops?: string[] | null
          shc_id?: string | null
          state?: string | null
          taluka?: string | null
          tenant_id?: string | null
          total_land_acres?: number | null
          updated_at?: string | null
          village?: string | null
        }
        Update: {
          aadhaar_number?: string | null
          address_line1?: string | null
          address_line2?: string | null
          annual_income_range?: string | null
          avatar_url?: string | null
          bio?: string | null
          coordinates?: unknown
          country?: string | null
          created_at?: string | null
          date_of_birth?: string | null
          device_tokens?: Json | null
          display_name?: string | null
          district?: string | null
          email?: string | null
          email_verified_at?: string | null
          expertise_areas?: string[] | null
          farmer_code?: string | null
          farmer_id?: string
          farming_experience_years?: number | null
          full_name?: string | null
          gender?: string | null
          has_irrigation?: boolean | null
          has_storage?: boolean | null
          has_tractor?: boolean | null
          id?: string
          is_account_locked?: boolean | null
          is_profile_complete?: boolean | null
          last_active_at?: string | null
          metadata?: Json | null
          mobile_number?: string | null
          notification_preferences?: Json | null
          password_changed_at?: string | null
          phone_verified?: boolean | null
          pincode?: string | null
          preferred_language?:
            | Database["public"]["Enums"]["language_code"]
            | null
          primary_crops?: string[] | null
          shc_id?: string | null
          state?: string | null
          taluka?: string | null
          tenant_id?: string | null
          total_land_acres?: number | null
          updated_at?: string | null
          village?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_farmer_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_profiles_farmer_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      user_sessions: {
        Row: {
          access_token_hash: string | null
          created_at: string
          device_info: Json | null
          expires_at: string
          id: string
          is_active: boolean | null
          last_activity_at: string | null
          refresh_token_hash: string | null
          session_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          access_token_hash?: string | null
          created_at?: string
          device_info?: Json | null
          expires_at: string
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          refresh_token_hash?: string | null
          session_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          access_token_hash?: string | null
          created_at?: string
          device_info?: Json | null
          expires_at?: string
          id?: string
          is_active?: boolean | null
          last_activity_at?: string | null
          refresh_token_hash?: string | null
          session_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_tenants: {
        Row: {
          created_at: string | null
          department: string | null
          designation: string | null
          employee_id: string | null
          id: string
          invited_at: string | null
          invited_by: string | null
          is_active: boolean | null
          is_primary: boolean | null
          joined_at: string | null
          metadata: Json | null
          permissions: Json | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          updated_at: string | null
          user_id: string
        }
        Insert: {
          created_at?: string | null
          department?: string | null
          designation?: string | null
          employee_id?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          joined_at?: string | null
          metadata?: Json | null
          permissions?: Json | null
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          updated_at?: string | null
          user_id: string
        }
        Update: {
          created_at?: string | null
          department?: string | null
          designation?: string | null
          employee_id?: string | null
          id?: string
          invited_at?: string | null
          invited_by?: string | null
          is_active?: boolean | null
          is_primary?: boolean | null
          joined_at?: string | null
          metadata?: Json | null
          permissions?: Json | null
          role?: Database["public"]["Enums"]["user_role"]
          tenant_id?: string
          updated_at?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "fk_user_tenants_tenant_id"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_tenants_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      video_tutorials: {
        Row: {
          category: string
          created_at: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          is_active: boolean | null
          is_featured: boolean | null
          language: string | null
          subcategory: string | null
          tags: string[] | null
          thumbnail_url: string | null
          title: string
          updated_at: string | null
          video_url: string
          view_count: number | null
        }
        Insert: {
          category: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          language?: string | null
          subcategory?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title: string
          updated_at?: string | null
          video_url: string
          view_count?: number | null
        }
        Update: {
          category?: string
          created_at?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          is_active?: boolean | null
          is_featured?: boolean | null
          language?: string | null
          subcategory?: string | null
          tags?: string[] | null
          thumbnail_url?: string | null
          title?: string
          updated_at?: string | null
          video_url?: string
          view_count?: number | null
        }
        Relationships: []
      }
      villages: {
        Row: {
          created_at: string | null
          id: string
          is_active: boolean | null
          name: string
          taluka_id: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name: string
          taluka_id: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          id?: string
          is_active?: boolean | null
          name?: string
          taluka_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "villages_taluka_id_fkey"
            columns: ["taluka_id"]
            isOneToOne: false
            referencedRelation: "talukas"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_error_corrections: {
        Row: {
          created_at: string | null
          farmer_id: string | null
          id: string
          intended_action: string | null
          language_code: string | null
          original_transcript: string
          session_id: string | null
          suggested_phrases: Json | null
          tenant_id: string
          was_helpful: boolean | null
        }
        Insert: {
          created_at?: string | null
          farmer_id?: string | null
          id?: string
          intended_action?: string | null
          language_code?: string | null
          original_transcript: string
          session_id?: string | null
          suggested_phrases?: Json | null
          tenant_id: string
          was_helpful?: boolean | null
        }
        Update: {
          created_at?: string | null
          farmer_id?: string | null
          id?: string
          intended_action?: string | null
          language_code?: string | null
          original_transcript?: string
          session_id?: string | null
          suggested_phrases?: Json | null
          tenant_id?: string
          was_helpful?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_error_corrections_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_error_corrections_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "voice_error_corrections_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "voice_sessions"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_error_corrections_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_navigation_intents: {
        Row: {
          action: string
          created_at: string | null
          id: string
          intent_id: string
          is_active: boolean | null
          is_offline: boolean | null
          language_code: string
          params: Json | null
          patterns: Json
          priority: string | null
          response_template: Json | null
          route: string | null
          synonyms: Json | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          id?: string
          intent_id: string
          is_active?: boolean | null
          is_offline?: boolean | null
          language_code: string
          params?: Json | null
          patterns?: Json
          priority?: string | null
          response_template?: Json | null
          route?: string | null
          synonyms?: Json | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          id?: string
          intent_id?: string
          is_active?: boolean | null
          is_offline?: boolean | null
          language_code?: string
          params?: Json | null
          patterns?: Json
          priority?: string | null
          response_template?: Json | null
          route?: string | null
          synonyms?: Json | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_navigation_intents_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_sessions: {
        Row: {
          created_at: string | null
          device_info: Json | null
          failed_commands: number | null
          farmer_id: string | null
          id: string
          language_code: string | null
          metadata: Json | null
          session_end: string | null
          session_start: string | null
          successful_commands: number | null
          tenant_id: string
          total_commands: number | null
        }
        Insert: {
          created_at?: string | null
          device_info?: Json | null
          failed_commands?: number | null
          farmer_id?: string | null
          id?: string
          language_code?: string | null
          metadata?: Json | null
          session_end?: string | null
          session_start?: string | null
          successful_commands?: number | null
          tenant_id: string
          total_commands?: number | null
        }
        Update: {
          created_at?: string | null
          device_info?: Json | null
          failed_commands?: number | null
          farmer_id?: string | null
          id?: string
          language_code?: string | null
          metadata?: Json | null
          session_end?: string | null
          session_start?: string | null
          successful_commands?: number | null
          tenant_id?: string
          total_commands?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_sessions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_sessions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "voice_sessions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_suggestions: {
        Row: {
          category: string
          created_at: string | null
          display_order: number | null
          id: string
          is_active: boolean | null
          language_code: string
          phonetic_hint: string | null
          suggestion_text: string
          tenant_id: string
        }
        Insert: {
          category: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          language_code: string
          phonetic_hint?: string | null
          suggestion_text: string
          tenant_id: string
        }
        Update: {
          category?: string
          created_at?: string | null
          display_order?: number | null
          id?: string
          is_active?: boolean | null
          language_code?: string
          phonetic_hint?: string | null
          suggestion_text?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_suggestions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      voice_training_samples: {
        Row: {
          audio_url: string
          confidence_score: number | null
          consent_given: boolean | null
          corrected_intent: string | null
          created_at: string | null
          detected_language: string | null
          duration_ms: number | null
          farmer_id: string
          id: string
          intent_matched: string | null
          metadata: Json | null
          tenant_id: string
          transcript: string | null
          was_correct: boolean | null
        }
        Insert: {
          audio_url: string
          confidence_score?: number | null
          consent_given?: boolean | null
          corrected_intent?: string | null
          created_at?: string | null
          detected_language?: string | null
          duration_ms?: number | null
          farmer_id: string
          id?: string
          intent_matched?: string | null
          metadata?: Json | null
          tenant_id: string
          transcript?: string | null
          was_correct?: boolean | null
        }
        Update: {
          audio_url?: string
          confidence_score?: number | null
          consent_given?: boolean | null
          corrected_intent?: string | null
          created_at?: string | null
          detected_language?: string | null
          duration_ms?: number | null
          farmer_id?: string
          id?: string
          intent_matched?: string | null
          metadata?: Json | null
          tenant_id?: string
          transcript?: string | null
          was_correct?: boolean | null
        }
        Relationships: [
          {
            foreignKeyName: "voice_training_samples_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_training_samples_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "voice_training_samples_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wallet_transactions: {
        Row: {
          amount: number
          balance_after: number | null
          balance_before: number | null
          created_at: string | null
          description: string | null
          id: string
          metadata: Json | null
          reference_id: string | null
          reference_type: string | null
          transaction_type: string
          wallet_id: string
        }
        Insert: {
          amount: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type: string
          wallet_id: string
        }
        Update: {
          amount?: number
          balance_after?: number | null
          balance_before?: number | null
          created_at?: string | null
          description?: string | null
          id?: string
          metadata?: Json | null
          reference_id?: string | null
          reference_type?: string | null
          transaction_type?: string
          wallet_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wallet_transactions_wallet_id_fkey"
            columns: ["wallet_id"]
            isOneToOne: false
            referencedRelation: "tenant_wallets"
            referencedColumns: ["id"]
          },
        ]
      }
      water_sources: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          label: string
          value: string
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label: string
          value: string
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          label?: string
          value?: string
        }
        Relationships: []
      }
      weather_activity_recommendations: {
        Row: {
          activity_type: string
          created_at: string
          description: string | null
          farmer_id: string
          id: string
          is_critical: boolean | null
          land_id: string | null
          optimal_conditions: string[] | null
          precautions: string[] | null
          recommended_date: string
          recommended_time_end: string | null
          recommended_time_start: string | null
          status: string | null
          suitability_score: number
          tenant_id: string
          title: string
          updated_at: string
          weather_conditions: Json | null
        }
        Insert: {
          activity_type: string
          created_at?: string
          description?: string | null
          farmer_id: string
          id?: string
          is_critical?: boolean | null
          land_id?: string | null
          optimal_conditions?: string[] | null
          precautions?: string[] | null
          recommended_date: string
          recommended_time_end?: string | null
          recommended_time_start?: string | null
          status?: string | null
          suitability_score: number
          tenant_id: string
          title: string
          updated_at?: string
          weather_conditions?: Json | null
        }
        Update: {
          activity_type?: string
          created_at?: string
          description?: string | null
          farmer_id?: string
          id?: string
          is_critical?: boolean | null
          land_id?: string | null
          optimal_conditions?: string[] | null
          precautions?: string[] | null
          recommended_date?: string
          recommended_time_end?: string | null
          recommended_time_start?: string | null
          status?: string | null
          suitability_score?: number
          tenant_id?: string
          title?: string
          updated_at?: string
          weather_conditions?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_weather_activity_recommendations_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_activity_recommendations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_activity_recommendations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "weather_activity_recommendations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "weather_activity_recommendations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_activity_recommendations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_activity_recommendations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      weather_aggregates: {
        Row: {
          aggregate_date: string
          agricultural_alerts: Json | null
          created_at: string
          disease_risk_level: string | null
          farmer_id: string | null
          frost_risk: boolean | null
          heat_stress_risk: boolean | null
          humidity_avg_percent: number | null
          id: string
          land_id: string | null
          rain_mm_afternoon: number | null
          rain_mm_evening: number | null
          rain_mm_morning: number | null
          rain_mm_night: number | null
          rain_mm_total: number
          sunshine_hours: number | null
          temp_avg_celsius: number | null
          temp_max_celsius: number | null
          temp_min_celsius: number | null
          tenant_id: string
          updated_at: string
          wind_speed_avg_kmh: number | null
          wind_speed_max_kmh: number | null
        }
        Insert: {
          aggregate_date: string
          agricultural_alerts?: Json | null
          created_at?: string
          disease_risk_level?: string | null
          farmer_id?: string | null
          frost_risk?: boolean | null
          heat_stress_risk?: boolean | null
          humidity_avg_percent?: number | null
          id?: string
          land_id?: string | null
          rain_mm_afternoon?: number | null
          rain_mm_evening?: number | null
          rain_mm_morning?: number | null
          rain_mm_night?: number | null
          rain_mm_total?: number
          sunshine_hours?: number | null
          temp_avg_celsius?: number | null
          temp_max_celsius?: number | null
          temp_min_celsius?: number | null
          tenant_id: string
          updated_at?: string
          wind_speed_avg_kmh?: number | null
          wind_speed_max_kmh?: number | null
        }
        Update: {
          aggregate_date?: string
          agricultural_alerts?: Json | null
          created_at?: string
          disease_risk_level?: string | null
          farmer_id?: string | null
          frost_risk?: boolean | null
          heat_stress_risk?: boolean | null
          humidity_avg_percent?: number | null
          id?: string
          land_id?: string | null
          rain_mm_afternoon?: number | null
          rain_mm_evening?: number | null
          rain_mm_morning?: number | null
          rain_mm_night?: number | null
          rain_mm_total?: number
          sunshine_hours?: number | null
          temp_avg_celsius?: number | null
          temp_max_celsius?: number | null
          temp_min_celsius?: number | null
          tenant_id?: string
          updated_at?: string
          wind_speed_avg_kmh?: number | null
          wind_speed_max_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_aggregates_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_aggregates_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "weather_aggregates_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_aggregates_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "weather_aggregates_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "weather_aggregates_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_aggregates_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_aggregates_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      weather_alerts: {
        Row: {
          affected_activities: string[] | null
          alert_id: string
          area_name: string
          cache_data: Json | null
          certainty: string
          created_at: string
          crop_impact_level: string | null
          data_source: string
          description: string | null
          end_time: string | null
          event_type: string
          id: string
          instruction: string | null
          is_active: boolean
          last_fetched: string | null
          latitude: number | null
          longitude: number | null
          recommendations: string[] | null
          severity: string
          start_time: string
          tenant_id: string | null
          title: string
          updated_at: string | null
          urgency: string
          user_location: Json | null
          user_preferences: Json | null
        }
        Insert: {
          affected_activities?: string[] | null
          alert_id: string
          area_name: string
          cache_data?: Json | null
          certainty: string
          created_at?: string
          crop_impact_level?: string | null
          data_source: string
          description?: string | null
          end_time?: string | null
          event_type: string
          id?: string
          instruction?: string | null
          is_active?: boolean
          last_fetched?: string | null
          latitude?: number | null
          longitude?: number | null
          recommendations?: string[] | null
          severity: string
          start_time: string
          tenant_id?: string | null
          title: string
          updated_at?: string | null
          urgency: string
          user_location?: Json | null
          user_preferences?: Json | null
        }
        Update: {
          affected_activities?: string[] | null
          alert_id?: string
          area_name?: string
          cache_data?: Json | null
          certainty?: string
          created_at?: string
          crop_impact_level?: string | null
          data_source?: string
          description?: string | null
          end_time?: string | null
          event_type?: string
          id?: string
          instruction?: string | null
          is_active?: boolean
          last_fetched?: string | null
          latitude?: number | null
          longitude?: number | null
          recommendations?: string[] | null
          severity?: string
          start_time?: string
          tenant_id?: string | null
          title?: string
          updated_at?: string | null
          urgency?: string
          user_location?: Json | null
          user_preferences?: Json | null
        }
        Relationships: []
      }
      weather_current: {
        Row: {
          cloud_cover_percent: number | null
          created_at: string
          data_source: string
          evapotranspiration_mm: number | null
          expires_at: string | null
          feels_like_celsius: number | null
          growing_degree_days: number | null
          humidity_percent: number | null
          id: string
          land_id: string | null
          latitude: number
          location_key: string | null
          longitude: number
          moon_phase: number | null
          observation_time: string
          pressure_hpa: number | null
          rain_1h_mm: number | null
          rain_24h_mm: number | null
          rain_3h_mm: number | null
          snow_1h_mm: number | null
          soil_moisture_percent: number | null
          soil_temperature_celsius: number | null
          station_id: string | null
          sunrise: string | null
          sunset: string | null
          temperature_celsius: number | null
          tenant_id: string | null
          uv_index: number | null
          visibility_km: number | null
          weather_description: string | null
          weather_icon: string | null
          weather_main: string | null
          wind_direction_degrees: number | null
          wind_gust_kmh: number | null
          wind_speed_kmh: number | null
        }
        Insert: {
          cloud_cover_percent?: number | null
          created_at?: string
          data_source: string
          evapotranspiration_mm?: number | null
          expires_at?: string | null
          feels_like_celsius?: number | null
          growing_degree_days?: number | null
          humidity_percent?: number | null
          id?: string
          land_id?: string | null
          latitude: number
          location_key?: string | null
          longitude: number
          moon_phase?: number | null
          observation_time: string
          pressure_hpa?: number | null
          rain_1h_mm?: number | null
          rain_24h_mm?: number | null
          rain_3h_mm?: number | null
          snow_1h_mm?: number | null
          soil_moisture_percent?: number | null
          soil_temperature_celsius?: number | null
          station_id?: string | null
          sunrise?: string | null
          sunset?: string | null
          temperature_celsius?: number | null
          tenant_id?: string | null
          uv_index?: number | null
          visibility_km?: number | null
          weather_description?: string | null
          weather_icon?: string | null
          weather_main?: string | null
          wind_direction_degrees?: number | null
          wind_gust_kmh?: number | null
          wind_speed_kmh?: number | null
        }
        Update: {
          cloud_cover_percent?: number | null
          created_at?: string
          data_source?: string
          evapotranspiration_mm?: number | null
          expires_at?: string | null
          feels_like_celsius?: number | null
          growing_degree_days?: number | null
          humidity_percent?: number | null
          id?: string
          land_id?: string | null
          latitude?: number
          location_key?: string | null
          longitude?: number
          moon_phase?: number | null
          observation_time?: string
          pressure_hpa?: number | null
          rain_1h_mm?: number | null
          rain_24h_mm?: number | null
          rain_3h_mm?: number | null
          snow_1h_mm?: number | null
          soil_moisture_percent?: number | null
          soil_temperature_celsius?: number | null
          station_id?: string | null
          sunrise?: string | null
          sunset?: string | null
          temperature_celsius?: number | null
          tenant_id?: string | null
          uv_index?: number | null
          visibility_km?: number | null
          weather_description?: string | null
          weather_icon?: string | null
          weather_main?: string | null
          wind_direction_degrees?: number | null
          wind_gust_kmh?: number | null
          wind_speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_current_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_current_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "weather_current_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "weather_current_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_current_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_current_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_current_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "weather_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_current_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_forecasts: {
        Row: {
          cloud_cover_percent: number | null
          created_at: string
          data_source: string
          evapotranspiration_mm: number | null
          feels_like_celsius: number | null
          forecast_time: string
          forecast_type: string
          growing_degree_days: number | null
          humidity_percent: number | null
          id: string
          land_id: string | null
          latitude: number
          location_key: string | null
          longitude: number
          pressure_hpa: number | null
          rain_amount_mm: number | null
          rain_probability_percent: number | null
          snow_amount_mm: number | null
          soil_temperature_celsius: number | null
          station_id: string | null
          temperature_celsius: number | null
          temperature_max_celsius: number | null
          temperature_min_celsius: number | null
          tenant_id: string | null
          uv_index: number | null
          weather_description: string | null
          weather_icon: string | null
          weather_main: string | null
          wind_direction_degrees: number | null
          wind_gust_kmh: number | null
          wind_speed_kmh: number | null
        }
        Insert: {
          cloud_cover_percent?: number | null
          created_at?: string
          data_source: string
          evapotranspiration_mm?: number | null
          feels_like_celsius?: number | null
          forecast_time: string
          forecast_type: string
          growing_degree_days?: number | null
          humidity_percent?: number | null
          id?: string
          land_id?: string | null
          latitude: number
          location_key?: string | null
          longitude: number
          pressure_hpa?: number | null
          rain_amount_mm?: number | null
          rain_probability_percent?: number | null
          snow_amount_mm?: number | null
          soil_temperature_celsius?: number | null
          station_id?: string | null
          temperature_celsius?: number | null
          temperature_max_celsius?: number | null
          temperature_min_celsius?: number | null
          tenant_id?: string | null
          uv_index?: number | null
          weather_description?: string | null
          weather_icon?: string | null
          weather_main?: string | null
          wind_direction_degrees?: number | null
          wind_gust_kmh?: number | null
          wind_speed_kmh?: number | null
        }
        Update: {
          cloud_cover_percent?: number | null
          created_at?: string
          data_source?: string
          evapotranspiration_mm?: number | null
          feels_like_celsius?: number | null
          forecast_time?: string
          forecast_type?: string
          growing_degree_days?: number | null
          humidity_percent?: number | null
          id?: string
          land_id?: string | null
          latitude?: number
          location_key?: string | null
          longitude?: number
          pressure_hpa?: number | null
          rain_amount_mm?: number | null
          rain_probability_percent?: number | null
          snow_amount_mm?: number | null
          soil_temperature_celsius?: number | null
          station_id?: string | null
          temperature_celsius?: number | null
          temperature_max_celsius?: number | null
          temperature_min_celsius?: number | null
          tenant_id?: string | null
          uv_index?: number | null
          weather_description?: string | null
          weather_icon?: string | null
          weather_main?: string | null
          wind_direction_degrees?: number | null
          wind_gust_kmh?: number | null
          wind_speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "weather_forecasts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_forecasts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "weather_forecasts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "weather_forecasts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_forecasts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_forecasts_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_forecasts_station_id_fkey"
            columns: ["station_id"]
            isOneToOne: false
            referencedRelation: "weather_stations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_forecasts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_historical: {
        Row: {
          created_at: string
          data_source: string
          evapotranspiration_mm: number | null
          growing_degree_days: number | null
          humidity_avg_percent: number | null
          id: string
          latitude: number
          longitude: number
          rainfall_mm: number | null
          record_date: string
          temperature_avg_celsius: number | null
          temperature_max_celsius: number | null
          temperature_min_celsius: number | null
          wind_speed_avg_kmh: number | null
        }
        Insert: {
          created_at?: string
          data_source: string
          evapotranspiration_mm?: number | null
          growing_degree_days?: number | null
          humidity_avg_percent?: number | null
          id?: string
          latitude: number
          longitude: number
          rainfall_mm?: number | null
          record_date: string
          temperature_avg_celsius?: number | null
          temperature_max_celsius?: number | null
          temperature_min_celsius?: number | null
          wind_speed_avg_kmh?: number | null
        }
        Update: {
          created_at?: string
          data_source?: string
          evapotranspiration_mm?: number | null
          growing_degree_days?: number | null
          humidity_avg_percent?: number | null
          id?: string
          latitude?: number
          longitude?: number
          rainfall_mm?: number | null
          record_date?: string
          temperature_avg_celsius?: number | null
          temperature_max_celsius?: number | null
          temperature_min_celsius?: number | null
          wind_speed_avg_kmh?: number | null
        }
        Relationships: []
      }
      weather_observations: {
        Row: {
          cloud_coverage_percent: number | null
          created_at: string
          dew_point_celsius: number | null
          farmer_id: string | null
          feels_like_celsius: number | null
          humidity_percent: number | null
          id: string
          land_id: string | null
          metadata: Json | null
          observation_date: string
          observation_time: string
          pressure_hpa: number | null
          rainfall_mm: number
          snow_1h_mm: number | null
          temperature_celsius: number | null
          tenant_id: string
          updated_at: string
          uv_index: number | null
          visibility_km: number | null
          weather_condition: string | null
          wind_direction: string | null
          wind_speed_kmh: number | null
        }
        Insert: {
          cloud_coverage_percent?: number | null
          created_at?: string
          dew_point_celsius?: number | null
          farmer_id?: string | null
          feels_like_celsius?: number | null
          humidity_percent?: number | null
          id?: string
          land_id?: string | null
          metadata?: Json | null
          observation_date: string
          observation_time?: string
          pressure_hpa?: number | null
          rainfall_mm?: number
          snow_1h_mm?: number | null
          temperature_celsius?: number | null
          tenant_id: string
          updated_at?: string
          uv_index?: number | null
          visibility_km?: number | null
          weather_condition?: string | null
          wind_direction?: string | null
          wind_speed_kmh?: number | null
        }
        Update: {
          cloud_coverage_percent?: number | null
          created_at?: string
          dew_point_celsius?: number | null
          farmer_id?: string | null
          feels_like_celsius?: number | null
          humidity_percent?: number | null
          id?: string
          land_id?: string | null
          metadata?: Json | null
          observation_date?: string
          observation_time?: string
          pressure_hpa?: number | null
          rainfall_mm?: number
          snow_1h_mm?: number | null
          temperature_celsius?: number | null
          tenant_id?: string
          updated_at?: string
          uv_index?: number | null
          visibility_km?: number | null
          weather_condition?: string | null
          wind_direction?: string | null
          wind_speed_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_observations_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_observations_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      weather_preferences: {
        Row: {
          alert_language: string | null
          created_at: string
          enable_activity_recommendations: boolean | null
          enable_push_notifications: boolean | null
          enable_sms_alerts: boolean | null
          enable_voice_alerts: boolean | null
          farmer_id: string
          humidity_high_alert_percent: number | null
          humidity_low_alert_percent: number | null
          id: string
          latitude: number
          longitude: number
          max_rain_probability_spray_percent: number | null
          max_temperature_spray_celsius: number | null
          max_wind_speed_spray_kmh: number | null
          min_temperature_spray_celsius: number | null
          preferred_station_id: string | null
          preferred_work_end_time: string | null
          preferred_work_start_time: string | null
          rain_probability_alert_percent: number | null
          temperature_max_alert: number | null
          temperature_min_alert: number | null
          tenant_id: string
          updated_at: string
          wind_speed_alert_kmh: number | null
        }
        Insert: {
          alert_language?: string | null
          created_at?: string
          enable_activity_recommendations?: boolean | null
          enable_push_notifications?: boolean | null
          enable_sms_alerts?: boolean | null
          enable_voice_alerts?: boolean | null
          farmer_id: string
          humidity_high_alert_percent?: number | null
          humidity_low_alert_percent?: number | null
          id?: string
          latitude: number
          longitude: number
          max_rain_probability_spray_percent?: number | null
          max_temperature_spray_celsius?: number | null
          max_wind_speed_spray_kmh?: number | null
          min_temperature_spray_celsius?: number | null
          preferred_station_id?: string | null
          preferred_work_end_time?: string | null
          preferred_work_start_time?: string | null
          rain_probability_alert_percent?: number | null
          temperature_max_alert?: number | null
          temperature_min_alert?: number | null
          tenant_id: string
          updated_at?: string
          wind_speed_alert_kmh?: number | null
        }
        Update: {
          alert_language?: string | null
          created_at?: string
          enable_activity_recommendations?: boolean | null
          enable_push_notifications?: boolean | null
          enable_sms_alerts?: boolean | null
          enable_voice_alerts?: boolean | null
          farmer_id?: string
          humidity_high_alert_percent?: number | null
          humidity_low_alert_percent?: number | null
          id?: string
          latitude?: number
          longitude?: number
          max_rain_probability_spray_percent?: number | null
          max_temperature_spray_celsius?: number | null
          max_wind_speed_spray_kmh?: number | null
          min_temperature_spray_celsius?: number | null
          preferred_station_id?: string | null
          preferred_work_end_time?: string | null
          preferred_work_start_time?: string | null
          rain_probability_alert_percent?: number | null
          temperature_max_alert?: number | null
          temperature_min_alert?: number | null
          tenant_id?: string
          updated_at?: string
          wind_speed_alert_kmh?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_weather_preferences_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_preferences_preferred_station_id_fkey"
            columns: ["preferred_station_id"]
            isOneToOne: false
            referencedRelation: "weather_stations"
            referencedColumns: ["id"]
          },
        ]
      }
      weather_stations: {
        Row: {
          created_at: string
          data_source: string
          elevation_meters: number | null
          id: string
          is_active: boolean
          last_updated: string | null
          latitude: number
          longitude: number
          name: string
          station_code: string
        }
        Insert: {
          created_at?: string
          data_source: string
          elevation_meters?: number | null
          id?: string
          is_active?: boolean
          last_updated?: string | null
          latitude: number
          longitude: number
          name: string
          station_code: string
        }
        Update: {
          created_at?: string
          data_source?: string
          elevation_meters?: number | null
          id?: string
          is_active?: boolean
          last_updated?: string | null
          latitude?: number
          longitude?: number
          name?: string
          station_code?: string
        }
        Relationships: []
      }
      webhook_logs: {
        Row: {
          attempt_number: number
          created_at: string
          delivered_at: string | null
          error_message: string | null
          event_type: string
          id: string
          payload: Json
          response_body: string | null
          response_time_ms: number | null
          status_code: number | null
          webhook_id: string
        }
        Insert: {
          attempt_number?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type: string
          id?: string
          payload: Json
          response_body?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          webhook_id: string
        }
        Update: {
          attempt_number?: number
          created_at?: string
          delivered_at?: string | null
          error_message?: string | null
          event_type?: string
          id?: string
          payload?: Json
          response_body?: string | null
          response_time_ms?: number | null
          status_code?: number | null
          webhook_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "webhook_logs_webhook_id_fkey"
            columns: ["webhook_id"]
            isOneToOne: false
            referencedRelation: "webhooks"
            referencedColumns: ["id"]
          },
        ]
      }
      webhooks: {
        Row: {
          created_at: string
          custom_headers: Json | null
          event_filters: Json | null
          events: string[]
          failure_count: number
          id: string
          is_active: boolean
          last_triggered_at: string | null
          name: string
          retry_attempts: number
          secret_key: string
          success_count: number
          tenant_id: string
          timeout_seconds: number
          updated_at: string
          url: string
        }
        Insert: {
          created_at?: string
          custom_headers?: Json | null
          event_filters?: Json | null
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name: string
          retry_attempts?: number
          secret_key: string
          success_count?: number
          tenant_id: string
          timeout_seconds?: number
          updated_at?: string
          url: string
        }
        Update: {
          created_at?: string
          custom_headers?: Json | null
          event_filters?: Json | null
          events?: string[]
          failure_count?: number
          id?: string
          is_active?: boolean
          last_triggered_at?: string | null
          name?: string
          retry_attempts?: number
          secret_key?: string
          success_count?: number
          tenant_id?: string
          timeout_seconds?: number
          updated_at?: string
          url?: string
        }
        Relationships: []
      }
      white_label_audit_log: {
        Row: {
          change_type: string
          changed_by: string | null
          created_at: string
          diff: Json | null
          full_snapshot: Json | null
          id: string
          tenant_id: string | null
          white_label_id: string
        }
        Insert: {
          change_type: string
          changed_by?: string | null
          created_at?: string
          diff?: Json | null
          full_snapshot?: Json | null
          id?: string
          tenant_id?: string | null
          white_label_id: string
        }
        Update: {
          change_type?: string
          changed_by?: string | null
          created_at?: string
          diff?: Json | null
          full_snapshot?: Json | null
          id?: string
          tenant_id?: string | null
          white_label_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "white_label_audit_log_white_label_id_fkey"
            columns: ["white_label_id"]
            isOneToOne: false
            referencedRelation: "white_label_configs"
            referencedColumns: ["id"]
          },
        ]
      }
      white_label_configs: {
        Row: {
          api_version: string | null
          app_customization: Json | null
          app_store_config: Json | null
          brand_identity: Json | null
          branding_version: string | null
          content_management: Json | null
          created_at: string | null
          created_by: string | null
          css_injection: Json | null
          distribution: Json | null
          domain_config: Json | null
          domain_health: Json | null
          email_templates: Json | null
          id: string
          is_active: boolean | null
          is_validated: boolean | null
          last_deployed_at: string | null
          last_synced_at: string | null
          mobile_theme: Json | null
          pwa_config: Json | null
          schema_version: string | null
          splash_screens: Json | null
          tenant_id: string | null
          theme_colors: Json | null
          updated_at: string | null
          updated_by: string | null
          validation_errors: Json | null
        }
        Insert: {
          api_version?: string | null
          app_customization?: Json | null
          app_store_config?: Json | null
          brand_identity?: Json | null
          branding_version?: string | null
          content_management?: Json | null
          created_at?: string | null
          created_by?: string | null
          css_injection?: Json | null
          distribution?: Json | null
          domain_config?: Json | null
          domain_health?: Json | null
          email_templates?: Json | null
          id?: string
          is_active?: boolean | null
          is_validated?: boolean | null
          last_deployed_at?: string | null
          last_synced_at?: string | null
          mobile_theme?: Json | null
          pwa_config?: Json | null
          schema_version?: string | null
          splash_screens?: Json | null
          tenant_id?: string | null
          theme_colors?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          validation_errors?: Json | null
        }
        Update: {
          api_version?: string | null
          app_customization?: Json | null
          app_store_config?: Json | null
          brand_identity?: Json | null
          branding_version?: string | null
          content_management?: Json | null
          created_at?: string | null
          created_by?: string | null
          css_injection?: Json | null
          distribution?: Json | null
          domain_config?: Json | null
          domain_health?: Json | null
          email_templates?: Json | null
          id?: string
          is_active?: boolean | null
          is_validated?: boolean | null
          last_deployed_at?: string | null
          last_synced_at?: string | null
          mobile_theme?: Json | null
          pwa_config?: Json | null
          schema_version?: string | null
          splash_screens?: Json | null
          tenant_id?: string | null
          theme_colors?: Json | null
          updated_at?: string | null
          updated_by?: string | null
          validation_errors?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "white_label_configs_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: true
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      wishlist_items: {
        Row: {
          added_at: string | null
          id: string
          product_id: string | null
          user_id: string
        }
        Insert: {
          added_at?: string | null
          id?: string
          product_id?: string | null
          user_id: string
        }
        Update: {
          added_at?: string | null
          id?: string
          product_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "wishlist_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "marketplace_products"
            referencedColumns: ["id"]
          },
        ]
      }
      yield_predictions: {
        Row: {
          actual_yield_per_acre: number | null
          confidence_score: number | null
          created_at: string
          crop_name: string
          factors_considered: Json | null
          farmer_id: string
          harvest_date_estimate: string | null
          id: string
          land_id: string
          model_version: string | null
          predicted_yield_per_acre: number
          prediction_accuracy: number | null
          prediction_date: string
          tenant_id: string
          updated_at: string
          variety: string | null
        }
        Insert: {
          actual_yield_per_acre?: number | null
          confidence_score?: number | null
          created_at?: string
          crop_name: string
          factors_considered?: Json | null
          farmer_id: string
          harvest_date_estimate?: string | null
          id?: string
          land_id: string
          model_version?: string | null
          predicted_yield_per_acre: number
          prediction_accuracy?: number | null
          prediction_date: string
          tenant_id: string
          updated_at?: string
          variety?: string | null
        }
        Update: {
          actual_yield_per_acre?: number | null
          confidence_score?: number | null
          created_at?: string
          crop_name?: string
          factors_considered?: Json | null
          farmer_id?: string
          harvest_date_estimate?: string | null
          id?: string
          land_id?: string
          model_version?: string | null
          predicted_yield_per_acre?: number
          prediction_accuracy?: number | null
          prediction_date?: string
          tenant_id?: string
          updated_at?: string
          variety?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_yield_predictions_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      active_subscriptions: {
        Row: {
          activation_code_id: string | null
          amount: number | null
          archived: boolean | null
          auto_renew: boolean | null
          created_at: string | null
          currency: string | null
          duration_days: number | null
          end_date: string | null
          farmer_id: string | null
          farmer_name: string | null
          id: string | null
          metadata: Json | null
          mobile_number: string | null
          payment_gateway: string | null
          payment_id: string | null
          plan_id: string | null
          plan_title: string | null
          start_date: string | null
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_activation_code_id_fkey"
            columns: ["activation_code_id"]
            isOneToOne: false
            referencedRelation: "activation_codes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      farmer_upcoming_needs: {
        Row: {
          crop_name: string | null
          crop_variety: string | null
          days_until_task: number | null
          estimated_cost: number | null
          farmer_id: string | null
          farmer_name: string | null
          location: string | null
          mobile_number: string | null
          resources: Json | null
          status: string | null
          task_date: string | null
          task_id: string | null
          task_name: string | null
          task_type: string | null
          tenant_id: string | null
        }
        Relationships: []
      }
      geography_columns: {
        Row: {
          coord_dimension: number | null
          f_geography_column: unknown
          f_table_catalog: unknown
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Relationships: []
      }
      geometry_columns: {
        Row: {
          coord_dimension: number | null
          f_geometry_column: unknown
          f_table_catalog: string | null
          f_table_name: unknown
          f_table_schema: unknown
          srid: number | null
          type: string | null
        }
        Insert: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Update: {
          coord_dimension?: number | null
          f_geometry_column?: unknown
          f_table_catalog?: string | null
          f_table_name?: unknown
          f_table_schema?: unknown
          srid?: number | null
          type?: string | null
        }
        Relationships: []
      }
      land_agent_context: {
        Row: {
          area_acres: number | null
          area_guntas: number | null
          boundary_polygon_old: Json | null
          center_point_old: Json | null
          cultivation_date: string | null
          current_crop: string | null
          district: string | null
          farmer_id: string | null
          farmer_language: string | null
          farmer_location: string | null
          farmer_name: string | null
          farmer_phone: string | null
          irrigation_type: string | null
          land_id: string | null
          land_name: string | null
          last_harvest_date: string | null
          previous_crop: string | null
          soil_type: string | null
          state: string | null
          survey_number: string | null
          taluka: string | null
          tenant_id: string | null
          village: string | null
          water_source: string | null
          weather_data: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "lands_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lands_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      land_boundary_overlaps: {
        Row: {
          land_a_area_sqm: number | null
          land_a_id: string | null
          land_a_name: string | null
          land_b_area_sqm: number | null
          land_b_id: string | null
          land_b_name: string | null
          overlap_area_sqm: number | null
          overlap_percent_of_a: number | null
          tenant_id: string | null
        }
        Relationships: []
      }
      land_tile_coverage: {
        Row: {
          acquisition_date: string | null
          cloud_cover: number | null
          coverage_percent: number | null
          land_id: string | null
          land_name: string | null
          ndvi_status: string | null
          tenant_id: string | null
          tile_id: string | null
        }
        Relationships: []
      }
      ndvi_coverage_stats: {
        Row: {
          lands_with_ndvi: number | null
          latest_ndvi_date: string | null
          total_lands: number | null
          unique_dates: number | null
        }
        Relationships: []
      }
      ndvi_full_view: {
        Row: {
          area_acres: number | null
          cloud_cover: number | null
          cloud_coverage: number | null
          collection_id: string | null
          coverage: number | null
          date: string | null
          district: string | null
          evi_value: number | null
          farmer_code: string | null
          farmer_id: string | null
          farmer_mobile: string | null
          farmer_name: string | null
          image_url: string | null
          land_id: string | null
          land_name: string | null
          last_ndvi_calculation: string | null
          last_ndvi_value: number | null
          ndvi_created_at: string | null
          ndvi_id: string | null
          ndvi_max: number | null
          ndvi_min: number | null
          ndvi_std: number | null
          ndvi_thumbnail_url: string | null
          ndvi_updated_at: string | null
          ndvi_value: number | null
          ndwi_value: number | null
          satellite_source: string | null
          savi_value: number | null
          state: string | null
          tenant_id: string | null
          user_district: string | null
          user_full_name: string | null
          user_mobile: string | null
          user_profile_id: string | null
          user_state: string | null
          user_village: string | null
          village: string | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_ndvi_data_tenant"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "ndvi_data_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
      pending_payouts: {
        Row: {
          amount: number | null
          archived: boolean | null
          bank_details: Json | null
          commission_rate: number | null
          created_at: string | null
          currency: string | null
          current_commission_rate: number | null
          failed_at: string | null
          failure_reason: string | null
          gateway: string | null
          gateway_response: Json | null
          id: string | null
          metadata: Json | null
          payout_method: string | null
          processed_at: string | null
          status: string | null
          tenant_id: string | null
          tenant_name: string | null
          transaction_amount: number | null
          transaction_id: string | null
          transfer_ref: string | null
          updated_at: string | null
        }
        Relationships: [
          {
            foreignKeyName: "payouts_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payouts_transaction_id_fkey"
            columns: ["transaction_id"]
            isOneToOne: false
            referencedRelation: "transactions"
            referencedColumns: ["id"]
          },
        ]
      }
      security_audit_summary: {
        Row: {
          audit_category: string | null
          issue_count: number | null
        }
        Relationships: []
      }
      v_active_scrapers: {
        Row: {
          active: boolean | null
          last_checked_at: string | null
          last_ingestion: string | null
          latest_data_date: string | null
          organization: string | null
          scraper_class: string | null
          state_code: string | null
          total_records: number | null
        }
        Relationships: []
      }
      v_recent_scraper_runs: {
        Row: {
          completed_at: string | null
          duration_seconds: number | null
          errors_count: number | null
          organization: string | null
          records_upserted: number | null
          scraper_class: string | null
          started_at: string | null
          state_code: string | null
          status: string | null
        }
        Relationships: []
      }
      v_scraper_performance: {
        Row: {
          avg_duration: number | null
          execution_date: string | null
          failed_runs: number | null
          last_run: string | null
          organization: string | null
          source_id: string | null
          state_code: string | null
          successful_runs: number | null
          total_records: number | null
          total_runs: number | null
        }
        Relationships: [
          {
            foreignKeyName: "scraper_execution_log_source_id_fkey"
            columns: ["source_id"]
            isOneToOne: false
            referencedRelation: "agri_market_sources"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_latest_soil_data: {
        Row: {
          agro_climatic_zone: string | null
          area_acres: number | null
          area_guntas: number | null
          confidence_level: string | null
          created_at: string | null
          data_completeness: number | null
          farmer_id: string | null
          field_area_ha: number | null
          id: string | null
          land_id: string | null
          moisture_status: string | null
          nitrogen_kg_per_ha: number | null
          organic_carbon: number | null
          ph_level: number | null
          phosphorus_kg_per_ha: number | null
          potassium_kg_per_ha: number | null
          sample_count: number | null
          soil_moisture_surface_percent: number | null
          source: string | null
          temperature_avg_c: number | null
          tenant_id: string | null
          test_date: string | null
          texture: string | null
        }
        Relationships: [
          {
            foreignKeyName: "soil_health_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soil_health_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "soil_health_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "soil_health_tenant_id_fkey"
            columns: ["tenant_id"]
            isOneToOne: false
            referencedRelation: "tenants"
            referencedColumns: ["id"]
          },
        ]
      }
      vw_soil_summary: {
        Row: {
          agro_climatic_zone: string | null
          area_acres: number | null
          area_guntas: number | null
          bulk_density: number | null
          cec: number | null
          clay_percent: number | null
          confidence_level: string | null
          created_at: string | null
          data_completeness: number | null
          data_quality_flags: Json | null
          data_quality_warnings: Json | null
          data_source: string | null
          farmer_id: string | null
          field_area_ha: number | null
          land_id: string | null
          moisture_status: string | null
          nitrogen_confidence: string | null
          nitrogen_kg_per_ha: number | null
          nitrogen_level: string | null
          nitrogen_total_kg: number | null
          organic_carbon: number | null
          organic_carbon_std: number | null
          ph_level: number | null
          ph_std: number | null
          phosphorus_confidence: string | null
          phosphorus_kg_per_ha: number | null
          phosphorus_level: string | null
          phosphorus_total_kg: number | null
          potassium_confidence: string | null
          potassium_kg_per_ha: number | null
          potassium_level: string | null
          potassium_total_kg: number | null
          precipitation_30d_mm: number | null
          sample_count: number | null
          sand_percent: number | null
          silt_percent: number | null
          soil_moisture_rootzone_percent: number | null
          soil_moisture_surface_percent: number | null
          soil_temperature_c: number | null
          temperature_avg_c: number | null
          tenant_id: string | null
          test_date: string | null
          texture: string | null
          updated_at: string | null
          water_balance_mm: number | null
        }
        Relationships: [
          {
            foreignKeyName: "lands_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lands_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
        ]
      }
      vw_zone_statistics: {
        Row: {
          agro_climatic_zone: string | null
          avg_completeness: number | null
          avg_moisture: number | null
          avg_nitrogen: number | null
          avg_oc: number | null
          avg_ph: number | null
          avg_phosphorus: number | null
          avg_potassium: number | null
          avg_samples: number | null
          high_confidence_count: number | null
          stddev_oc: number | null
          stddev_ph: number | null
          total_analyses: number | null
        }
        Relationships: []
      }
      weather_with_location: {
        Row: {
          area_acres: number | null
          center_lat: number | null
          center_lon: number | null
          cloud_coverage_percent: number | null
          created_at: string | null
          dew_point_celsius: number | null
          district: string | null
          farmer_id: string | null
          feels_like_celsius: number | null
          humidity_percent: number | null
          id: string | null
          land_id: string | null
          land_name: string | null
          location_coords: Json | null
          metadata: Json | null
          observation_date: string | null
          observation_time: string | null
          pressure_hpa: number | null
          rainfall_mm: number | null
          temperature_celsius: number | null
          tenant_id: string | null
          updated_at: string | null
          uv_index: number | null
          village: string | null
          visibility_km: number | null
          weather_condition: string | null
          wind_direction: string | null
          wind_speed_kmh: number | null
        }
        Relationships: [
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "fk_weather_land"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_observations_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "farmers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_observations_farmer_id_fkey"
            columns: ["farmer_id"]
            isOneToOne: false
            referencedRelation: "ndvi_full_view"
            referencedColumns: ["farmer_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_agent_context"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_a_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_boundary_overlaps"
            referencedColumns: ["land_b_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "land_tile_coverage"
            referencedColumns: ["land_id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "lands"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "weather_observations_land_id_fkey"
            columns: ["land_id"]
            isOneToOne: false
            referencedRelation: "vw_soil_summary"
            referencedColumns: ["land_id"]
          },
        ]
      }
    }
    Functions: {
      _postgis_deprecate: {
        Args: { newname: string; oldname: string; version: string }
        Returns: undefined
      }
      _postgis_index_extent: {
        Args: { col: string; tbl: unknown }
        Returns: unknown
      }
      _postgis_pgsql_version: { Args: never; Returns: string }
      _postgis_scripts_pgsql_version: { Args: never; Returns: string }
      _postgis_selectivity: {
        Args: { att_name: string; geom: unknown; mode?: string; tbl: unknown }
        Returns: number
      }
      _postgis_stats: {
        Args: { ""?: string; att_name: string; tbl: unknown }
        Returns: string
      }
      _st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_crosses: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      _st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      _st_intersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      _st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      _st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      _st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_sortablehash: { Args: { geom: unknown }; Returns: number }
      _st_touches: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      _st_voronoi: {
        Args: {
          clip?: unknown
          g1: unknown
          return_polygons?: boolean
          tolerance?: number
        }
        Returns: unknown
      }
      _st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      addauth: { Args: { "": string }; Returns: boolean }
      addgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              new_dim: number
              new_srid_in: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              schema_name: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              new_dim: number
              new_srid: number
              new_type: string
              table_name: string
              use_typmod?: boolean
            }
            Returns: string
          }
      advance_onboarding_step: {
        Args: {
          p_new_status: Database["public"]["Enums"]["onboarding_step_status"]
          p_step_data?: Json
          p_step_id: string
        }
        Returns: Json
      }
      aggregate_weather_data: { Args: never; Returns: undefined }
      archive_tenant_data: {
        Args: {
          p_archive_location: string
          p_encryption_key_id: string
          p_tenant_id: string
        }
        Returns: Json
      }
      assign_mgrs_tile_to_land:
        | { Args: never; Returns: Json }
        | { Args: { land_id_param?: string }; Returns: undefined }
      award_activity_points: {
        Args: {
          p_activity_type: string
          p_community_id: string
          p_farmer_id: string
          p_points: number
        }
        Returns: undefined
      }
      award_points: {
        Args: {
          description: string
          farmer_id: string
          points: number
          points_type: string
          reference_id?: string
        }
        Returns: undefined
      }
      calculate_area_km2: { Args: { geom: unknown }; Returns: number }
      calculate_engagement_score: { Args: { post_id: string }; Returns: number }
      calculate_evapotranspiration: {
        Args: {
          humidity_percent: number
          solar_radiation?: number
          temp_celsius: number
          wind_speed_kmh: number
        }
        Returns: number
      }
      calculate_field_stats: {
        Args: { p_tenant_id: string }
        Returns: {
          analyzed_fields: number
          avg_nitrogen: number
          avg_ph: number
          fields_need_attention: number
          total_fields: number
        }[]
      }
      calculate_growing_degree_days: {
        Args: { base_temp?: number; temp_max: number; temp_min: number }
        Returns: number
      }
      calculate_land_health_score: {
        Args: { land_uuid: string }
        Returns: number
      }
      calculate_lead_score: { Args: { lead_id: string }; Returns: number }
      calculate_onboarding_progress: {
        Args: { workflow_id: string }
        Returns: number
      }
      calculate_product_demand: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: {
          predicted_demand: number
          product_type: string
          urgency_level: string
        }[]
      }
      calculate_vegetation_health_score: {
        Args: {
          p_data_completeness: number
          p_ndvi_mean: number
          p_ndvi_std_dev: number
          p_vegetation_coverage: number
        }
        Returns: number
      }
      can_create_admin: { Args: never; Returns: boolean }
      can_self_insert: { Args: never; Returns: boolean }
      check_account_lockout: {
        Args: { p_email: string; p_ip_address?: unknown }
        Returns: Json
      }
      check_admin_permission: {
        Args: { required_role?: string }
        Returns: boolean
      }
      check_badge_eligibility: {
        Args: { farmer_id: string }
        Returns: undefined
      }
      check_bootstrap_status: { Args: never; Returns: Json }
      check_harvest_quota: { Args: { p_tenant_id: string }; Returns: Json }
      check_mobile_number_exists: {
        Args: { mobile_num: string }
        Returns: {
          profile: Json
          user_exists: boolean
        }[]
      }
      check_product_duplicate: {
        Args: {
          p_brand?: string
          p_name?: string
          p_sku?: string
          p_tenant_id: string
        }
        Returns: {
          brand: string
          id: string
          match_type: string
          name: string
          sku: string
        }[]
      }
      check_registration_status: {
        Args: { p_email?: string; p_token?: string }
        Returns: Json
      }
      check_slug_availability:
        | { Args: { p_slug: string }; Returns: Json }
        | { Args: { p_slug: string; p_tenant_id?: string }; Returns: Json }
      classify_ndvi_value: { Args: { ndvi_value: number }; Returns: string }
      cleanup_bootstrap_state: { Args: never; Returns: undefined }
      cleanup_expired_registrations: { Args: never; Returns: number }
      cleanup_expired_sessions: { Args: never; Returns: undefined }
      cleanup_expired_weather_cache: { Args: never; Returns: number }
      cleanup_old_dashboard_updates: { Args: never; Returns: number }
      cleanup_old_data_with_retention: {
        Args: never
        Returns: {
          archived_count: number
          deleted_count: number
          table_name: string
        }[]
      }
      cleanup_old_idempotency_records: { Args: never; Returns: number }
      cleanup_old_metrics: {
        Args: { keep_count?: number; table_name: string }
        Returns: number
      }
      cleanup_old_rate_limits: { Args: never; Returns: undefined }
      cluster_lands_for_ndvi: {
        Args: {
          p_max_cluster_area_km2?: number
          p_max_distance_km?: number
          p_tenant_id: string
        }
        Returns: {
          bbox_area_km2: number
          cluster_bbox: Json
          cluster_id: number
          land_count: number
          land_ids: string[]
        }[]
      }
      complete_bootstrap: { Args: never; Returns: undefined }
      complete_bootstrap_for_user: {
        Args: { user_email: string; user_id: string; user_name: string }
        Returns: boolean
      }
      complete_bootstrap_safely: { Args: never; Returns: Json }
      convert_lead_to_tenant: {
        Args: {
          p_admin_email?: string
          p_admin_name?: string
          p_lead_id: string
          p_subscription_plan?: string
          p_tenant_name: string
          p_tenant_slug: string
        }
        Returns: Json
      }
      convert_lead_to_tenant_secure: {
        Args: {
          p_admin_email?: string
          p_admin_name?: string
          p_lead_id: string
          p_subscription_plan?: string
          p_tenant_name: string
          p_tenant_slug: string
        }
        Returns: Json
      }
      create_tenant_with_validation: {
        Args: {
          p_business_address?: Json
          p_business_registration?: string
          p_custom_domain?: string
          p_established_date?: string
          p_max_api_calls_per_day?: number
          p_max_dealers?: number
          p_max_farmers?: number
          p_max_products?: number
          p_max_storage_gb?: number
          p_metadata?: Json
          p_name: string
          p_owner_email?: string
          p_owner_name?: string
          p_owner_phone?: string
          p_slug: string
          p_status?: string
          p_subdomain?: string
          p_subscription_end_date?: string
          p_subscription_plan?: string
          p_subscription_start_date?: string
          p_trial_ends_at?: string
          p_type: string
        }
        Returns: Json
      }
      debug_auth_state: {
        Args: never
        Returns: {
          current_user_id: string
          db_role: string
          db_user: string
        }[]
      }
      debug_jwt_status: {
        Args: never
        Returns: {
          current_user_id: string
          is_expired: boolean
          jwt_exp: string
          jwt_present: boolean
        }[]
      }
      detect_land_overlaps: {
        Args: { p_tenant: string }
        Returns: {
          land_a: string
          land_b: string
          overlap_area_m2: number
        }[]
      }
      disable_expired_tenant_features: { Args: never; Returns: undefined }
      disablelongtransactions: { Args: never; Returns: string }
      dropgeometrycolumn:
        | {
            Args: {
              catalog_name: string
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | {
            Args: {
              column_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { column_name: string; table_name: string }; Returns: string }
      dropgeometrytable:
        | {
            Args: {
              catalog_name: string
              schema_name: string
              table_name: string
            }
            Returns: string
          }
        | { Args: { schema_name: string; table_name: string }; Returns: string }
        | { Args: { table_name: string }; Returns: string }
      enablelongtransactions: { Args: never; Returns: string }
      ensure_onboarding_workflow: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      ensure_user_tenant_access: {
        Args: { p_tenant_id: string; p_user_id?: string }
        Returns: boolean
      }
      equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      evaluate_feature_flag: {
        Args: {
          p_context?: Json
          p_flag_name: string
          p_tenant_id: string
          p_user_id?: string
        }
        Returns: boolean
      }
      expire_old_invites: { Args: never; Returns: number }
      extract_numeric_quantity: {
        Args: { resources: Json; task_type: string }
        Returns: number
      }
      find_intersecting_districts: {
        Args: { tile_geom: unknown }
        Returns: {
          district_code: string
          id: string
          name: string
        }[]
      }
      find_intersecting_states: {
        Args: { tile_geom: unknown }
        Returns: {
          id: string
          name: string
          state_code: string
        }[]
      }
      find_mgrs_tile_for_land: {
        Args: { land_geom: unknown }
        Returns: {
          geometry: unknown
          id: string
          tile_id: string
        }[]
      }
      find_tiles_for_land: {
        Args: { p_land_id: string }
        Returns: {
          acquisition_date: string
          cloud_cover: number
          land_coverage_sqm: number
          overlap_percent: number
          tile_area_sqm: number
          tile_id: string
        }[]
      }
      generate_credit_note_number: { Args: never; Returns: string }
      generate_farmer_code: { Args: { p_tenant_id: string }; Returns: string }
      generate_invite_token: { Args: never; Returns: string }
      generate_invoice_number: { Args: never; Returns: string }
      generate_order_number: { Args: { p_tenant_id: string }; Returns: string }
      generate_otp: { Args: { p_length?: number }; Returns: string }
      generate_slug_suggestions: {
        Args: { p_organization_name: string }
        Returns: Json
      }
      geometry: { Args: { "": string }; Returns: unknown }
      geometry_above: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_below: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_cmp: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_contained_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_contains_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_distance_box: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_distance_centroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      geometry_eq: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_ge: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_gt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_le: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_left: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_lt: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overabove: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overbelow: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overlaps_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overleft: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_overright: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_right: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_same_3d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geometry_within: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      geomfromewkt: { Args: { "": string }; Returns: unknown }
      get_agri_tiles: {
        Args: { country_code: string }
        Returns: {
          tile_id: string
        }[]
      }
      get_all_tiles:
        | {
            Args: never
            Returns: {
              acquisition_date: string
              actual_download_status: string | null
              api_source: string | null
              bbox: Json | null
              bbox_geom: unknown
              cloud_cover: number | null
              collection: string
              country_id: string | null
              created_at: string | null
              data_completeness_percent: number | null
              error_message: string | null
              file_size_mb: number | null
              id: string
              mgrs_tile_id: string | null
              ndvi_calculation_timestamp: string | null
              ndvi_max: number | null
              ndvi_mean: number | null
              ndvi_min: number | null
              ndvi_path: string | null
              ndvi_size_bytes: number | null
              ndvi_std_dev: number | null
              nir_band_path: string | null
              nir_band_size_bytes: number | null
              pixel_count: number | null
              processing_completed_at: string | null
              processing_level: string | null
              processing_method: string | null
              processing_stage: string | null
              red_band_path: string | null
              red_band_size_bytes: number | null
              resolution: string | null
              status: string | null
              tile_id: string
              updated_at: string | null
              valid_pixel_count: number | null
              vegetation_coverage_percent: number | null
              vegetation_health_score: number | null
            }[]
            SetofOptions: {
              from: "*"
              to: "satellite_tiles"
              isOneToOne: false
              isSetofReturn: true
            }
          }
        | {
            Args: { country_code: string }
            Returns: {
              tile_id: string
            }[]
          }
      get_available_tenants_for_onboarding: {
        Args: never
        Returns: {
          id: string
          name: string
        }[]
      }
      get_bootstrap_status: { Args: never; Returns: Json }
      get_current_admin_role: { Args: never; Returns: string }
      get_current_farmer_context: {
        Args: never
        Returns: {
          farmer_data: Json
          farmer_id: string
          tenant_id: string
        }[]
      }
      get_current_farmer_id: { Args: never; Returns: string }
      get_current_tenant_id: { Args: never; Returns: string }
      get_current_user_email: { Args: never; Returns: string }
      get_current_user_id: { Args: never; Returns: string }
      get_farmer_id_from_header: { Args: never; Returns: string }
      get_geometry_bbox: { Args: { geom: unknown }; Returns: number[] }
      get_header_farmer_id: { Args: never; Returns: string }
      get_header_tenant_id: { Args: never; Returns: string }
      get_inventory_gap: {
        Args: { p_days?: number; p_tenant_id: string }
        Returns: {
          current_stock: number
          gap: number
          gap_percentage: number
          predicted_demand: number
          product_type: string
          urgency_level: string
        }[]
      }
      get_jwt_dealer_id: { Args: never; Returns: string }
      get_jwt_farmer_id: { Args: never; Returns: string }
      get_jwt_tenant_id: { Args: never; Returns: string }
      get_land_ndvi_grids:
        | {
            Args: { land_id: string }
            Returns: {
              ndvi_histogram: Json
              overlap_ratio: number
            }[]
          }
        | {
            Args: { land_id: string; max_days_back?: number }
            Returns: {
              ndvi_histogram: Json
              overlap_ratio: number
            }[]
          }
      get_lands_by_tile: {
        Args: { p_tile_id: string }
        Returns: {
          area_hectares: number
          boundary: Json
          farmer_id: string
          land_id: string
          tenant_id: string
        }[]
      }
      get_lands_in_tile: {
        Args: { p_tenant_id: string; p_tile_id: string }
        Returns: {
          area_acres: number
          farmer_id: string
          id: string
          name: string
        }[]
      }
      get_lands_with_geojson_boundary: {
        Args: never
        Returns: {
          boundary: Json
          id: string
          name: string
          tenant_id: string
        }[]
      }
      get_latest_soil_data: {
        Args: { p_land_id: string }
        Returns: {
          confidence_level: string
          moisture_status: string
          nitrogen_kg_per_ha: number
          organic_carbon: number
          ph_level: number
          phosphorus_kg_per_ha: number
          potassium_kg_per_ha: number
          soil_health_id: string
          source: string
          test_date: string
        }[]
      }
      get_location_context: {
        Args: { lat: number; lng: number }
        Returns: Json
      }
      get_mobile_white_label_config: {
        Args: { p_tenant_id: string }
        Returns: Json
      }
      get_next_scraper_to_run: {
        Args: never
        Returns: {
          last_checked_minutes_ago: number
          organization: string
          source_id: string
          state_code: string
        }[]
      }
      get_onboarding_template: {
        Args: { subscription_plan: string; tenant_type: string }
        Returns: Json
      }
      get_or_create_onboarding_workflow: {
        Args: { p_tenant_id: string }
        Returns: string
      }
      get_request_farmer_id: { Args: never; Returns: string }
      get_session_farmer_id: { Args: never; Returns: string }
      get_session_tenant_id: { Args: never; Returns: string }
      get_spray_suitability: {
        Args: {
          humidity_percent: number
          rain_probability_percent: number
          temp_celsius: number
          wind_speed_kmh: number
        }
        Returns: number
      }
      get_super_admin_count: { Args: never; Returns: number }
      get_tenant_api_costs: {
        Args: {
          p_end_date?: string
          p_start_date?: string
          p_tenant_id: string
        }
        Returns: {
          avg_response_time_ms: number
          calls_by_type: Json
          failed_calls: number
          successful_calls: number
          total_calls: number
          total_cost_usd: number
          total_data_mb: number
          total_processing_units: number
        }[]
      }
      get_tenant_tiles: {
        Args: { p_tenant_id: string }
        Returns: {
          land_count: number
          tile_id: string
        }[]
      }
      get_tiles_covering_lands: {
        Args: never
        Returns: {
          geojson_geometry: Json
          geometry: unknown
          id: string
          is_agri: boolean
          tile_id: string
          total_lands_count: number
        }[]
      }
      get_tiles_for_processing:
        | {
            Args: { country_code: string; days_since_last_update?: number }
            Returns: {
              country_id: string
              last_processed: string
              tile_id: string
            }[]
          }
        | {
            Args: { p_country_id: string; p_limit?: number }
            Returns: {
              country_id: string
              created_at: string
              id: string
              tile_id: string
              updated_at: string
            }[]
          }
      get_tiles_intersecting_lands:
        | {
            Args: never
            Returns: {
              geojson_geometry: Json
              geometry: unknown
              id: string
              is_agri: boolean
              tile_id: string
              total_lands_count: number
            }[]
          }
        | {
            Args: { tile_ids: string[] }
            Returns: {
              geojson_geometry: Json
              geometry: unknown
              id: string
              is_agri: boolean
              tile_id: string
              total_lands_count: number
            }[]
          }
      get_tiles_with_lands: {
        Args: never
        Returns: {
          agri_area_km2: number
          lands_count: number
          tile_id: string
        }[]
      }
      get_user_group_ids: { Args: { _farmer_id: string }; Returns: string[] }
      get_user_storage_usage: {
        Args: { user_id: string }
        Returns: {
          bucket_name: string
          file_count: number
          total_size_bytes: number
          total_size_mb: number
        }[]
      }
      get_user_tenant_id: { Args: { _user_id: string }; Returns: string }
      get_user_tenant_relationships: {
        Args: {
          p_include_inactive?: boolean
          p_tenant_id?: string
          p_user_id?: string
        }
        Returns: {
          created_at: string
          id: string
          is_active: boolean
          metadata: Json
          role: Database["public"]["Enums"]["user_role"]
          tenant_id: string
          tenant_name: string
          tenant_slug: string
          updated_at: string
          user_email: string
          user_id: string
        }[]
      }
      gettransactionid: { Args: never; Returns: unknown }
      has_tenant_access: { Args: { check_tenant_id: string }; Returns: boolean }
      insert_land_with_geometry: {
        Args: {
          p_area_acres: number
          p_area_guntas?: number
          p_area_sqft?: number
          p_boundary_geojson?: Json
          p_center_geojson?: Json
          p_cultivation_date?: string
          p_current_crop?: string
          p_district?: string
          p_district_id?: string
          p_farmer_id: string
          p_irrigation_type?: string
          p_last_harvest_date?: string
          p_name: string
          p_ownership_type: string
          p_previous_crop?: string
          p_soil_type?: string
          p_state?: string
          p_state_id?: string
          p_survey_number?: string
          p_taluka?: string
          p_taluka_id?: string
          p_tenant_id: string
          p_village?: string
          p_village_id?: string
          p_water_source?: string
        }
        Returns: Json
      }
      is_admin_user: { Args: { _user_id: string }; Returns: boolean }
      is_authenticated_admin: { Args: never; Returns: boolean }
      is_bootstrap_completed: { Args: never; Returns: boolean }
      is_bootstrap_required: { Args: never; Returns: boolean }
      is_current_user_admin: { Args: never; Returns: boolean }
      is_current_user_super_admin: { Args: never; Returns: boolean }
      is_group_member: {
        Args: { _farmer_id: string; _group_id: string }
        Returns: boolean
      }
      is_invite_valid: { Args: { invite_token: string }; Returns: boolean }
      is_moderator: { Args: never; Returns: boolean }
      is_super_admin: { Args: never; Returns: boolean }
      is_tenant_active: { Args: { _tenant_id: string }; Returns: boolean }
      is_tenant_admin:
        | { Args: never; Returns: boolean }
        | { Args: { _tenant_id: string }; Returns: boolean }
      is_user_tenant_admin: {
        Args: { target_tenant_id: string }
        Returns: boolean
      }
      join_community: {
        Args: { p_community_id: string; p_farmer_id: string }
        Returns: Json
      }
      leave_community: {
        Args: { p_community_id: string; p_farmer_id: string }
        Returns: Json
      }
      log_admin_action: {
        Args: {
          p_action: string
          p_details?: Json
          p_ip_address?: unknown
          p_target_admin_id?: string
          p_user_agent?: string
        }
        Returns: string
      }
      log_enhanced_admin_action: {
        Args: {
          p_action: string
          p_correlation_id?: string
          p_details?: Json
          p_duration_ms?: number
          p_ip_address?: unknown
          p_request_id?: string
          p_request_payload?: Json
          p_response_data?: Json
          p_security_context?: Json
          p_session_id?: string
          p_target_admin_id?: string
          p_user_agent?: string
        }
        Returns: string
      }
      log_security_event:
        | {
            Args: {
              event_type: string
              ip_address?: string
              metadata?: Json
              tenant_id?: string
              user_agent?: string
              user_id?: string
            }
            Returns: string
          }
        | {
            Args: {
              p_event_details?: Json
              p_event_type?: string
              p_ip_address?: unknown
              p_risk_level?: string
              p_user_agent?: string
              p_user_id?: string
            }
            Returns: string
          }
      log_tenant_detection_event: {
        Args: {
          p_detection_method?: string
          p_domain: string
          p_error_details?: Json
          p_event_type: string
          p_fallback_reason?: string
          p_ip_address?: unknown
          p_metadata?: Json
          p_session_id?: string
          p_tenant_id?: string
          p_user_agent?: string
        }
        Returns: string
      }
      longtransactionsenabled: { Args: never; Returns: boolean }
      manage_user_tenant_relationship: {
        Args: {
          p_is_active?: boolean
          p_metadata?: Json
          p_operation?: string
          p_role: Database["public"]["Enums"]["user_role"]
          p_tenant_id: string
          p_user_id: string
        }
        Returns: Json
      }
      mark_agricultural_tile: {
        Args: { p_land_area_km2: number; p_tile_id: string }
        Returns: undefined
      }
      mark_invitation_accepted: { Args: { token: string }; Returns: boolean }
      mark_invitation_clicked: { Args: { token: string }; Returns: boolean }
      mark_invite_used: { Args: { invite_token: string }; Returns: boolean }
      migrate_tenant_domains: { Args: never; Returns: undefined }
      migrate_theme_data_to_appearance_settings: {
        Args: never
        Returns: undefined
      }
      populate_geometry_columns:
        | { Args: { tbl_oid: unknown; use_typmod?: boolean }; Returns: number }
        | { Args: { use_typmod?: boolean }; Returns: string }
      postgis_constraint_dims: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_srid: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: number
      }
      postgis_constraint_type: {
        Args: { geomcolumn: string; geomschema: string; geomtable: string }
        Returns: string
      }
      postgis_extensions_upgrade: { Args: never; Returns: string }
      postgis_full_version: { Args: never; Returns: string }
      postgis_geos_version: { Args: never; Returns: string }
      postgis_lib_build_date: { Args: never; Returns: string }
      postgis_lib_revision: { Args: never; Returns: string }
      postgis_lib_version: { Args: never; Returns: string }
      postgis_libjson_version: { Args: never; Returns: string }
      postgis_liblwgeom_version: { Args: never; Returns: string }
      postgis_libprotobuf_version: { Args: never; Returns: string }
      postgis_libxml_version: { Args: never; Returns: string }
      postgis_proj_version: { Args: never; Returns: string }
      postgis_scripts_build_date: { Args: never; Returns: string }
      postgis_scripts_installed: { Args: never; Returns: string }
      postgis_scripts_released: { Args: never; Returns: string }
      postgis_svn_version: { Args: never; Returns: string }
      postgis_type_name: {
        Args: {
          coord_dimension: number
          geomname: string
          use_new_name?: boolean
        }
        Returns: string
      }
      postgis_version: { Args: never; Returns: string }
      postgis_wagyu_version: { Args: never; Returns: string }
      reactivate_tenant: { Args: { p_tenant_id: string }; Returns: Json }
      reassign_lead: {
        Args: { p_lead_id: string; p_new_admin_id: string; p_reason?: string }
        Returns: boolean
      }
      record_failed_login: {
        Args: { p_email: string; p_ip_address?: unknown }
        Returns: Json
      }
      refresh_farmer_upcoming_needs: { Args: never; Returns: undefined }
      refresh_organization_analytics: {
        Args: { p_tenant_id: string }
        Returns: undefined
      }
      remove_onboarding_workflow: {
        Args: { p_workflow_id: string }
        Returns: Json
      }
      sanitize_white_label_config: {
        Args: { config_data: Json }
        Returns: Json
      }
      send_admin_notification: {
        Args: {
          p_message: string
          p_metadata?: Json
          p_priority?: string
          p_recipient_id: string
          p_title: string
          p_type?: string
        }
        Returns: string
      }
      set_app_session: {
        Args: {
          p_farmer_id: string
          p_session_token?: string
          p_tenant_id: string
        }
        Returns: undefined
      }
      set_onboarding_step_data: {
        Args: { p_new_status?: string; p_step_data: Json; p_step_id: string }
        Returns: Json
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      st_3dclosestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3ddistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dintersects: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_3dlongestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmakebox: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_3dmaxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_3dshortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_addpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_angle:
        | { Args: { line1: unknown; line2: unknown }; Returns: number }
        | {
            Args: { pt1: unknown; pt2: unknown; pt3: unknown; pt4?: unknown }
            Returns: number
          }
      st_area:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_asencodedpolyline: {
        Args: { geom: unknown; nprecision?: number }
        Returns: string
      }
      st_asewkt: { Args: { "": string }; Returns: string }
      st_asgeojson:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | {
            Args: {
              geom_column?: string
              maxdecimaldigits?: number
              pretty_bool?: boolean
              r: Record<string, unknown>
            }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_asgml:
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
            }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
        | {
            Args: {
              geog: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown
              id?: string
              maxdecimaldigits?: number
              nprefix?: string
              options?: number
              version: number
            }
            Returns: string
          }
      st_askml:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; nprefix?: string }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_aslatlontext: {
        Args: { geom: unknown; tmpl?: string }
        Returns: string
      }
      st_asmarc21: { Args: { format?: string; geom: unknown }; Returns: string }
      st_asmvtgeom: {
        Args: {
          bounds: unknown
          buffer?: number
          clip_geom?: boolean
          extent?: number
          geom: unknown
        }
        Returns: unknown
      }
      st_assvg:
        | {
            Args: { geog: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | {
            Args: { geom: unknown; maxdecimaldigits?: number; rel?: number }
            Returns: string
          }
        | { Args: { "": string }; Returns: string }
      st_astext: { Args: { "": string }; Returns: string }
      st_astwkb:
        | {
            Args: {
              geom: unknown
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
        | {
            Args: {
              geom: unknown[]
              ids: number[]
              prec?: number
              prec_m?: number
              prec_z?: number
              with_boxes?: boolean
              with_sizes?: boolean
            }
            Returns: string
          }
      st_asx3d: {
        Args: { geom: unknown; maxdecimaldigits?: number; options?: number }
        Returns: string
      }
      st_azimuth:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: number }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_boundingdiagonal: {
        Args: { fits?: boolean; geom: unknown }
        Returns: unknown
      }
      st_buffer:
        | {
            Args: { geom: unknown; options?: string; radius: number }
            Returns: unknown
          }
        | {
            Args: { geom: unknown; quadsegs: number; radius: number }
            Returns: unknown
          }
      st_centroid: { Args: { "": string }; Returns: unknown }
      st_clipbybox2d: {
        Args: { box: unknown; geom: unknown }
        Returns: unknown
      }
      st_closestpoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_collect: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_concavehull: {
        Args: {
          param_allow_holes?: boolean
          param_geom: unknown
          param_pctconvex: number
        }
        Returns: unknown
      }
      st_contains: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_containsproperly: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_coorddim: { Args: { geometry: unknown }; Returns: number }
      st_coveredby:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_covers:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_crosses: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_curvetoline: {
        Args: { flags?: number; geom: unknown; tol?: number; toltype?: number }
        Returns: unknown
      }
      st_delaunaytriangles: {
        Args: { flags?: number; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_difference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_disjoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_distance:
        | {
            Args: { geog1: unknown; geog2: unknown; use_spheroid?: boolean }
            Returns: number
          }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
      st_distancesphere:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: number }
        | {
            Args: { geom1: unknown; geom2: unknown; radius: number }
            Returns: number
          }
      st_distancespheroid: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_dwithin: {
        Args: {
          geog1: unknown
          geog2: unknown
          tolerance: number
          use_spheroid?: boolean
        }
        Returns: boolean
      }
      st_equals: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_expand:
        | { Args: { box: unknown; dx: number; dy: number }; Returns: unknown }
        | {
            Args: { box: unknown; dx: number; dy: number; dz?: number }
            Returns: unknown
          }
        | {
            Args: {
              dm?: number
              dx: number
              dy: number
              dz?: number
              geom: unknown
            }
            Returns: unknown
          }
      st_force3d: { Args: { geom: unknown; zvalue?: number }; Returns: unknown }
      st_force3dm: {
        Args: { geom: unknown; mvalue?: number }
        Returns: unknown
      }
      st_force3dz: {
        Args: { geom: unknown; zvalue?: number }
        Returns: unknown
      }
      st_force4d: {
        Args: { geom: unknown; mvalue?: number; zvalue?: number }
        Returns: unknown
      }
      st_generatepoints:
        | { Args: { area: unknown; npoints: number }; Returns: unknown }
        | {
            Args: { area: unknown; npoints: number; seed: number }
            Returns: unknown
          }
      st_geogfromtext: { Args: { "": string }; Returns: unknown }
      st_geographyfromtext: { Args: { "": string }; Returns: unknown }
      st_geohash:
        | { Args: { geog: unknown; maxchars?: number }; Returns: string }
        | { Args: { geom: unknown; maxchars?: number }; Returns: string }
      st_geomcollfromtext: { Args: { "": string }; Returns: unknown }
      st_geometricmedian: {
        Args: {
          fail_if_not_converged?: boolean
          g: unknown
          max_iter?: number
          tolerance?: number
        }
        Returns: unknown
      }
      st_geometryfromtext: { Args: { "": string }; Returns: unknown }
      st_geomfromewkt: { Args: { "": string }; Returns: unknown }
      st_geomfromgeojson:
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": Json }; Returns: unknown }
        | { Args: { "": string }; Returns: unknown }
      st_geomfromgml: { Args: { "": string }; Returns: unknown }
      st_geomfromkml: { Args: { "": string }; Returns: unknown }
      st_geomfrommarc21: { Args: { marc21xml: string }; Returns: unknown }
      st_geomfromtext: { Args: { "": string }; Returns: unknown }
      st_gmltosql: { Args: { "": string }; Returns: unknown }
      st_hasarc: { Args: { geometry: unknown }; Returns: boolean }
      st_hausdorffdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_hexagon: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_hexagongrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_interpolatepoint: {
        Args: { line: unknown; point: unknown }
        Returns: number
      }
      st_intersection: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_intersects:
        | { Args: { geog1: unknown; geog2: unknown }; Returns: boolean }
        | { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_isvaliddetail: {
        Args: { flags?: number; geom: unknown }
        Returns: Database["public"]["CompositeTypes"]["valid_detail"]
        SetofOptions: {
          from: "*"
          to: "valid_detail"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      st_length:
        | { Args: { geog: unknown; use_spheroid?: boolean }; Returns: number }
        | { Args: { "": string }; Returns: number }
      st_letters: { Args: { font?: Json; letters: string }; Returns: unknown }
      st_linecrossingdirection: {
        Args: { line1: unknown; line2: unknown }
        Returns: number
      }
      st_linefromencodedpolyline: {
        Args: { nprecision?: number; txtin: string }
        Returns: unknown
      }
      st_linefromtext: { Args: { "": string }; Returns: unknown }
      st_linelocatepoint: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_linetocurve: { Args: { geometry: unknown }; Returns: unknown }
      st_locatealong: {
        Args: { geometry: unknown; leftrightoffset?: number; measure: number }
        Returns: unknown
      }
      st_locatebetween: {
        Args: {
          frommeasure: number
          geometry: unknown
          leftrightoffset?: number
          tomeasure: number
        }
        Returns: unknown
      }
      st_locatebetweenelevations: {
        Args: { fromelevation: number; geometry: unknown; toelevation: number }
        Returns: unknown
      }
      st_longestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makebox2d: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makeline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_makevalid: {
        Args: { geom: unknown; params: string }
        Returns: unknown
      }
      st_maxdistance: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: number
      }
      st_minimumboundingcircle: {
        Args: { inputgeom: unknown; segs_per_quarter?: number }
        Returns: unknown
      }
      st_mlinefromtext: { Args: { "": string }; Returns: unknown }
      st_mpointfromtext: { Args: { "": string }; Returns: unknown }
      st_mpolyfromtext: { Args: { "": string }; Returns: unknown }
      st_multilinestringfromtext: { Args: { "": string }; Returns: unknown }
      st_multipointfromtext: { Args: { "": string }; Returns: unknown }
      st_multipolygonfromtext: { Args: { "": string }; Returns: unknown }
      st_node: { Args: { g: unknown }; Returns: unknown }
      st_normalize: { Args: { geom: unknown }; Returns: unknown }
      st_offsetcurve: {
        Args: { distance: number; line: unknown; params?: string }
        Returns: unknown
      }
      st_orderingequals: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_overlaps: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: boolean
      }
      st_perimeter: {
        Args: { geog: unknown; use_spheroid?: boolean }
        Returns: number
      }
      st_pointfromtext: { Args: { "": string }; Returns: unknown }
      st_pointm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
        }
        Returns: unknown
      }
      st_pointz: {
        Args: {
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_pointzm: {
        Args: {
          mcoordinate: number
          srid?: number
          xcoordinate: number
          ycoordinate: number
          zcoordinate: number
        }
        Returns: unknown
      }
      st_polyfromtext: { Args: { "": string }; Returns: unknown }
      st_polygonfromtext: { Args: { "": string }; Returns: unknown }
      st_project: {
        Args: { azimuth: number; distance: number; geog: unknown }
        Returns: unknown
      }
      st_quantizecoordinates: {
        Args: {
          g: unknown
          prec_m?: number
          prec_x: number
          prec_y?: number
          prec_z?: number
        }
        Returns: unknown
      }
      st_reduceprecision: {
        Args: { geom: unknown; gridsize: number }
        Returns: unknown
      }
      st_relate: { Args: { geom1: unknown; geom2: unknown }; Returns: string }
      st_removerepeatedpoints: {
        Args: { geom: unknown; tolerance?: number }
        Returns: unknown
      }
      st_segmentize: {
        Args: { geog: unknown; max_segment_length: number }
        Returns: unknown
      }
      st_setsrid:
        | { Args: { geog: unknown; srid: number }; Returns: unknown }
        | { Args: { geom: unknown; srid: number }; Returns: unknown }
      st_sharedpaths: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_shortestline: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_simplifypolygonhull: {
        Args: { geom: unknown; is_outer?: boolean; vertex_fraction: number }
        Returns: unknown
      }
      st_split: { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
      st_square: {
        Args: { cell_i: number; cell_j: number; origin?: unknown; size: number }
        Returns: unknown
      }
      st_squaregrid: {
        Args: { bounds: unknown; size: number }
        Returns: Record<string, unknown>[]
      }
      st_srid:
        | { Args: { geog: unknown }; Returns: number }
        | { Args: { geom: unknown }; Returns: number }
      st_subdivide: {
        Args: { geom: unknown; gridsize?: number; maxvertices?: number }
        Returns: unknown[]
      }
      st_swapordinates: {
        Args: { geom: unknown; ords: unknown }
        Returns: unknown
      }
      st_symdifference: {
        Args: { geom1: unknown; geom2: unknown; gridsize?: number }
        Returns: unknown
      }
      st_symmetricdifference: {
        Args: { geom1: unknown; geom2: unknown }
        Returns: unknown
      }
      st_tileenvelope: {
        Args: {
          bounds?: unknown
          margin?: number
          x: number
          y: number
          zoom: number
        }
        Returns: unknown
      }
      st_touches: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_transform:
        | {
            Args: { from_proj: string; geom: unknown; to_proj: string }
            Returns: unknown
          }
        | {
            Args: { from_proj: string; geom: unknown; to_srid: number }
            Returns: unknown
          }
        | { Args: { geom: unknown; to_proj: string }; Returns: unknown }
      st_triangulatepolygon: { Args: { g1: unknown }; Returns: unknown }
      st_union:
        | { Args: { geom1: unknown; geom2: unknown }; Returns: unknown }
        | {
            Args: { geom1: unknown; geom2: unknown; gridsize: number }
            Returns: unknown
          }
      st_voronoilines: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_voronoipolygons: {
        Args: { extend_to?: unknown; g1: unknown; tolerance?: number }
        Returns: unknown
      }
      st_within: { Args: { geom1: unknown; geom2: unknown }; Returns: boolean }
      st_wkbtosql: { Args: { wkb: string }; Returns: unknown }
      st_wkttosql: { Args: { "": string }; Returns: unknown }
      st_wrapx: {
        Args: { geom: unknown; move: number; wrap: number }
        Returns: unknown
      }
      start_onboarding_workflow:
        | {
            Args: { p_force_new?: boolean; p_tenant_id: string }
            Returns: Json
          }
        | { Args: { p_tenant_id: string; p_version?: number }; Returns: string }
      suspend_tenant: {
        Args: { p_reason?: string; p_tenant_id: string }
        Returns: Json
      }
      test_lead_auto_assignment: { Args: never; Returns: Json }
      track_admin_session: { Args: { session_data?: Json }; Returns: undefined }
      track_failed_login: {
        Args: {
          p_ip_address?: unknown
          p_user_agent?: string
          p_user_id: string
        }
        Returns: undefined
      }
      track_user_login: {
        Args: {
          p_ip_address?: unknown
          p_user_agent?: string
          p_user_id: string
        }
        Returns: undefined
      }
      unlockrows: { Args: { "": string }; Returns: number }
      update_community_trending_score: { Args: never; Returns: undefined }
      update_tenant_verification: {
        Args: { p_tenant_id: string; p_verification_data: Json }
        Returns: boolean
      }
      update_tiles_for_land: { Args: { p_land_id: string }; Returns: undefined }
      update_user_presence: {
        Args: {
          p_location?: Json
          p_organization_id: string
          p_status?: string
        }
        Returns: undefined
      }
      updategeometrysrid: {
        Args: {
          catalogn_name: string
          column_name: string
          new_srid_in: number
          schema_name: string
          table_name: string
        }
        Returns: string
      }
      upsert_tenant_branding: {
        Args: {
          p_accent_color?: string
          p_app_name?: string
          p_background_color?: string
          p_font_family?: string
          p_logo_url?: string
          p_primary_color?: string
          p_secondary_color?: string
          p_tenant_id: string
          p_text_color?: string
        }
        Returns: boolean
      }
      upsert_tenant_features: {
        Args: {
          p_advanced_analytics?: boolean
          p_basic_analytics?: boolean
          p_custom_reports?: boolean
          p_farmer_management?: boolean
          p_iot_integration?: boolean
          p_mobile_app?: boolean
          p_predictive_analytics?: boolean
          p_satellite_imagery?: boolean
          p_sms_notifications?: boolean
          p_tenant_id: string
          p_voice_calls?: boolean
          p_weather_forecast?: boolean
          p_whatsapp_integration?: boolean
        }
        Returns: boolean
      }
      user_has_tenant_access: {
        Args: { tenant_uuid: string }
        Returns: boolean
      }
      user_owns_schedule: {
        Args: { _schedule_id: string; _user_id: string }
        Returns: boolean
      }
      validate_admin_registration_token: {
        Args: { p_token: string }
        Returns: {
          email: string
          expires_at: string
          invite_id: string
          role: string
          valid: boolean
        }[]
      }
      validate_farmer_pin:
        | {
            Args: { p_farmer_id: string; p_pin: string; p_tenant_id: string }
            Returns: boolean
          }
        | {
            Args: { p_mobile_number: string; p_pin_hash: string }
            Returns: boolean
          }
      validate_invitation_token: {
        Args: { token: string }
        Returns: {
          email: string
          expires_at: string
          invitation_id: string
          invitation_type: string
          is_valid: boolean
          tenant_id: string
        }[]
      }
      validate_invite_token: {
        Args: { token: string }
        Returns: {
          email: string
          expires_at: string
          invite_id: string
          is_valid: boolean
          role: string
        }[]
      }
      validate_photo_location: {
        Args: {
          p_land_id: string
          p_lat: number
          p_lon: number
          p_tolerance_meters?: number
        }
        Returns: {
          distance_meters: number
          is_valid: boolean
          validation_level: string
        }[]
      }
      validate_registration_token_secure: {
        Args: { p_token: string }
        Returns: Json
      }
      validate_tenant_ownership: {
        Args: { p_email: string }
        Returns: {
          is_owner: boolean
          onboarding_complete: boolean
          owner_email: string
          tenant_id: string
          tenant_name: string
          tenant_slug: string
        }[]
      }
      validate_white_label_config: {
        Args: { config_data: Json }
        Returns: Json
      }
      verify_admin_user_setup: {
        Args: never
        Returns: {
          admin_role: string
          email: string
          is_verified: boolean
          issues: string[]
          user_id: string
        }[]
      }
    }
    Enums: {
      alert_severity: "low" | "medium" | "high" | "critical" | "info"
      alert_status: "active" | "acknowledged" | "resolved"
      billing_interval:
        | "monthly"
        | "quarterly"
        | "annually"
        | "biannual"
        | "lifetime"
      community_type:
        | "state"
        | "crop"
        | "language"
        | "practice"
        | "market"
        | "problem_solving"
      language_code:
        | "en"
        | "hi"
        | "mr"
        | "pa"
        | "gu"
        | "te"
        | "ta"
        | "kn"
        | "ml"
        | "or"
        | "bn"
        | "ur"
        | "ne"
      legal_document_type:
        | "incorporation_certificate"
        | "gst_certificate"
        | "pan_card"
        | "address_proof"
        | "bank_statement"
        | "trade_license"
        | "msme_certificate"
        | "other"
      metric_type: "system" | "usage" | "ai_model" | "financial" | "custom"
      onboarding_step_status:
        | "pending"
        | "in_progress"
        | "completed"
        | "skipped"
        | "failed"
      payment_status:
        | "pending"
        | "paid"
        | "partial"
        | "overdue"
        | "failed"
        | "refunded"
        | "chargeback"
      post_status: "draft" | "published" | "moderated" | "deleted"
      post_type: "text" | "image" | "video" | "poll"
      subscription_plan:
        | "Kisan_Basic"
        | "Shakti_Growth"
        | "AI_Enterprise"
        | "custom"
      subscription_plan_type: "basic" | "premium" | "enterprise" | "custom"
      tenant_status:
        | "trial"
        | "active"
        | "suspended"
        | "cancelled"
        | "archived"
        | "pending_approval"
      tenant_type:
        | "agri_company"
        | "dealer"
        | "ngo"
        | "government"
        | "university"
        | "sugar_factory"
        | "cooperative"
        | "insurance"
      transaction_status:
        | "pending"
        | "processing"
        | "completed"
        | "failed"
        | "cancelled"
        | "refunded"
        | "on_hold"
      user_role:
        | "super_admin"
        | "tenant_owner"
        | "tenant_admin"
        | "tenant_manager"
        | "dealer"
        | "agent"
        | "farmer"
      verification_status:
        | "pending"
        | "under_review"
        | "approved"
        | "rejected"
        | "expired"
    }
    CompositeTypes: {
      geometry_dump: {
        path: number[] | null
        geom: unknown
      }
      valid_detail: {
        valid: boolean | null
        reason: string | null
        location: unknown
      }
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      alert_severity: ["low", "medium", "high", "critical", "info"],
      alert_status: ["active", "acknowledged", "resolved"],
      billing_interval: [
        "monthly",
        "quarterly",
        "annually",
        "biannual",
        "lifetime",
      ],
      community_type: [
        "state",
        "crop",
        "language",
        "practice",
        "market",
        "problem_solving",
      ],
      language_code: [
        "en",
        "hi",
        "mr",
        "pa",
        "gu",
        "te",
        "ta",
        "kn",
        "ml",
        "or",
        "bn",
        "ur",
        "ne",
      ],
      legal_document_type: [
        "incorporation_certificate",
        "gst_certificate",
        "pan_card",
        "address_proof",
        "bank_statement",
        "trade_license",
        "msme_certificate",
        "other",
      ],
      metric_type: ["system", "usage", "ai_model", "financial", "custom"],
      onboarding_step_status: [
        "pending",
        "in_progress",
        "completed",
        "skipped",
        "failed",
      ],
      payment_status: [
        "pending",
        "paid",
        "partial",
        "overdue",
        "failed",
        "refunded",
        "chargeback",
      ],
      post_status: ["draft", "published", "moderated", "deleted"],
      post_type: ["text", "image", "video", "poll"],
      subscription_plan: [
        "Kisan_Basic",
        "Shakti_Growth",
        "AI_Enterprise",
        "custom",
      ],
      subscription_plan_type: ["basic", "premium", "enterprise", "custom"],
      tenant_status: [
        "trial",
        "active",
        "suspended",
        "cancelled",
        "archived",
        "pending_approval",
      ],
      tenant_type: [
        "agri_company",
        "dealer",
        "ngo",
        "government",
        "university",
        "sugar_factory",
        "cooperative",
        "insurance",
      ],
      transaction_status: [
        "pending",
        "processing",
        "completed",
        "failed",
        "cancelled",
        "refunded",
        "on_hold",
      ],
      user_role: [
        "super_admin",
        "tenant_owner",
        "tenant_admin",
        "tenant_manager",
        "dealer",
        "agent",
        "farmer",
      ],
      verification_status: [
        "pending",
        "under_review",
        "approved",
        "rejected",
        "expired",
      ],
    },
  },
} as const
