-- 1) Server-only writes/reads: restrict to service_role
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('lead_audit_logs','System can insert audit logs'),
    ('satellite_api_usage','System can insert API usage'),
    ('learning_suggestions','System can manage learning suggestions'),
    ('ai_schedule_refinements','System can insert refinements'),
    ('edge_invocation_logs','System can insert edge invocation logs'),
    ('white_label_audit_log','System can insert audit logs'),
    ('tenant_onboarding_status','System can manage onboarding status'),
    ('safety_verifications','System can insert safety verifications'),
    ('ai_decision_log','System can log decisions'),
    ('treatment_outcomes','System can manage treatment outcomes'),
    ('proactive_evaluation_log','Service can insert evaluation logs'),
    ('proactive_evaluation_log','Service insert proactive_eval_log'),
    ('proactive_evaluation_log','Service select proactive_eval_log'),
    ('sas_token_cache','System can manage SAS token cache'),
    ('decision_rules_history','Allow insert to rule history'),
    ('decision_rules_history','Allow read access to rule history'),
    ('email_events','System can insert email events'),
    ('email_events','System can update email events'),
    ('ndvi_request_queue','System can manage request queue'),
    ('organization_analytics','System can update analytics'),
    ('rate_limit_buckets','Service role can manage rate limits'),
    ('rate_limits','System can manage rate limits'),
    ('rule_performance','System can manage rule performance'),
    ('subscription_usage_logs','usage_logs_system_insert'),
    ('agri_marketing_insights','System can create insights'),
    ('farmer_alerts','System can create alerts'),
    ('lead_assignments','System can insert assignments'),
    ('expert_escalations','System can manage escalations'),
    ('copernicus_api_calls','System can insert API call logs'),
    ('activation_logs','System can insert activation logs'),
    ('tile_marking_progress','System can manage tile marking progress'),
    ('crop_growth_history','System can manage history'),
    ('audit_logs','System can insert audit logs'),
    ('ai_chat_audit_logs','Service role can insert audit logs'),
    ('orchestrator_metrics','System can insert metrics'),
    ('email_verifications','System can manage verifications'),
    ('ai_training_context','Service role can manage training context'),
    ('schedule_monitoring','System can insert monitoring data'),
    ('user_points','System can manage points'),
    ('user_badges','System can manage badges'),
    ('community_member_activity','System can manage member activity'),
    ('market_prices','Users can add market prices'),
    ('market_prices','Anyone can view market prices'),
    ('proactive_rules','Allow insert proactive_rules'),
    ('proactive_rules','Allow update proactive_rules'),
    ('proactive_rules','Authenticated can read proactive rules'),
    ('proactive_rules','Public read proactive_rules'),
    ('community_moderation','Moderators can create moderation logs'),
    ('community_moderation','Moderators can view moderation logs'),
    ('satellite_tiles','Allow public read'),
    ('satellite_tiles','Allow select for authenticated'),
    ('satellite_tiles','read satellite tiles'),
    ('pest_resurgence_risk','read_all'),
    ('confidence_adjustments','Authenticated read confidence adjustments'),
    ('establishment_implement','establishment_implement_authenticated_read'),
    ('rule_source_evidence','rse_read_authenticated'),
    ('alert_suppression_matrix','asm_read'),
    ('satellite_intelligence_config','satellite_intelligence_config_read'),
    ('risk_episodes','risk_episodes_read'),
    ('proactive_evaluator_config','pec_read'),
    ('system_config','Authenticated users can read config'),
    ('email_templates','Allow authenticated users to manage email templates'),
    ('email_templates','Allow authenticated users to read email templates')
  ) v(t,n) LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I TO service_role', r.n, r.t);
  END LOOP;
END $$;

-- 2) Admin-only management
ALTER POLICY "Admins can manage guidelines" ON public.crop_baseline_guidelines
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

-- 3) Farmer-owned / tenant-scoped data using verified session helpers
ALTER POLICY "Tenant admins can view marketing insights" ON public.agri_marketing_insights
  USING (tenant_id = public.get_current_tenant_id() OR public.is_super_admin());
ALTER POLICY "Farmers can view their own refinements" ON public.ai_schedule_refinements
  USING (farmer_id = public.get_current_farmer_id());
ALTER POLICY "Farmers can update refinement status" ON public.ai_schedule_refinements
  USING (farmer_id = public.get_current_farmer_id()) WITH CHECK (farmer_id = public.get_current_farmer_id());
ALTER POLICY "Farmers can view their monitoring data" ON public.schedule_monitoring
  USING (farmer_id = public.get_current_farmer_id());

-- 4) Spoofable header checks -> verified session identity
ALTER POLICY "Farmers can create completions" ON public.task_completions
  WITH CHECK (farmer_id = auth.uid() OR farmer_id = public.get_current_farmer_id());
ALTER POLICY "Farmers can view their completions" ON public.task_completions
  USING (farmer_id = auth.uid() OR farmer_id = public.get_current_farmer_id());
ALTER POLICY "Users can update own messages" ON public.group_chat_messages
  USING (farmer_id = public.get_current_farmer_id());
ALTER POLICY "System can insert consent logs" ON public.farmer_consent_log
  WITH CHECK (tenant_id = public.get_current_tenant_id() AND farmer_id = public.get_current_farmer_id());
ALTER POLICY "Farmers can view their own consents" ON public.farmer_consent_log
  USING (farmer_id = public.get_current_farmer_id() AND tenant_id = public.get_current_tenant_id());
ALTER POLICY "comments update own" ON public.post_comments USING (farmer_id = public.get_current_farmer_id());
ALTER POLICY "comments delete own" ON public.post_comments USING (farmer_id = public.get_current_farmer_id());
ALTER POLICY "comments insert" ON public.post_comments
  WITH CHECK (farmer_id = public.get_current_farmer_id() AND tenant_id = public.get_current_tenant_id());
ALTER POLICY "comments read" ON public.post_comments USING (tenant_id = public.get_current_tenant_id());
ALTER POLICY "Anyone can view comments" ON public.post_comments USING (tenant_id = public.get_current_tenant_id());
ALTER POLICY "reports insert" ON public.post_reports WITH CHECK (farmer_id = public.get_current_farmer_id());
ALTER POLICY "reports read own" ON public.post_reports USING (farmer_id = public.get_current_farmer_id());
ALTER POLICY "Users can delete own reactions" ON public.post_reactions USING (farmer_id = public.get_current_farmer_id());

-- 5) Community/social: verified farmers only; writes bound to the caller
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('communities','Everyone can view communities'),
    ('community_events','Anyone can view events'),
    ('community_polls','Anyone can view polls'),
    ('community_member_activity','Anyone can view member activity'),
    ('farmer_follows','Anyone can view follows'),
    ('farmer_gamification','Anyone can view gamification stats'),
    ('followers','Users can view followers'),
    ('farmer_achievements','Anyone can view farmer achievements'),
    ('user_badges','Users can view all badges'),
    ('user_points','Users can view all points'),
    ('leaderboards','Anyone can view leaderboards'),
    ('poll_votes','Users can view poll results'),
    ('post_polls','Users can view polls'),
    ('post_likes','post_likes_select_all'),
    ('post_interactions','Anyone can view interactions'),
    ('post_shares','Users can view shares'),
    ('post_reactions','Anyone can view reactions'),
    ('group_chat_messages','Group members can view messages'),
    ('marketplace_reviews','Anyone can view reviews')
  ) v(t,n) LOOP
    EXECUTE format('ALTER POLICY %I ON public.%I USING (public.get_current_farmer_id() IS NOT NULL OR public.is_super_admin())', r.n, r.t);
  END LOOP;
END $$;

ALTER POLICY "Products are viewable by everyone" ON public.marketplace_products
  USING (tenant_id = public.get_current_tenant_id() OR public.is_super_admin());
ALTER POLICY "Reviews are viewable by everyone" ON public.product_reviews
  USING (tenant_id = public.get_current_tenant_id() OR public.is_super_admin());
ALTER POLICY "Authenticated users can view profiles" ON public.profiles
  USING (id = auth.uid() OR public.is_super_admin());

ALTER POLICY "Anyone can create events" ON public.community_events WITH CHECK (created_by = public.get_current_farmer_id());
ALTER POLICY "Anyone can create polls" ON public.community_polls WITH CHECK (created_by = public.get_current_farmer_id());
ALTER POLICY "Anyone can update polls (for voting)" ON public.community_polls
  USING (public.get_current_farmer_id() IS NOT NULL) WITH CHECK (public.get_current_farmer_id() IS NOT NULL);
ALTER POLICY "Authenticated users can send messages" ON public.group_chat_messages
  WITH CHECK (farmer_id = public.get_current_farmer_id());
ALTER POLICY "Authenticated users can add reactions" ON public.post_reactions
  WITH CHECK (farmer_id = public.get_current_farmer_id());

-- 6) Storage: bind writes to the uploading user
ALTER POLICY "Authenticated users can update product images" ON storage.objects
  USING (bucket_id = 'product-images' AND (owner_id = (select auth.uid()::text) OR public.is_super_admin()));
ALTER POLICY "Authenticated users can delete product images" ON storage.objects
  USING (bucket_id = 'product-images' AND (owner_id = (select auth.uid()::text) OR public.is_super_admin()));
ALTER POLICY "Authenticated users can upload product images" ON storage.objects
  WITH CHECK (bucket_id = 'product-images' AND owner_id = (select auth.uid()::text));
ALTER POLICY "Authenticated users can update their tenant assets" ON storage.objects
  USING (bucket_id = 'tenant-assets' AND (storage.foldername(name))[1] LIKE 'tenant-%' AND (owner_id = (select auth.uid()::text) OR public.is_super_admin()))
  WITH CHECK (bucket_id = 'tenant-assets' AND (storage.foldername(name))[1] LIKE 'tenant-%' AND (owner_id = (select auth.uid()::text) OR public.is_super_admin()));
ALTER POLICY "Authenticated users can delete their tenant assets" ON storage.objects
  USING (bucket_id = 'tenant-assets' AND (storage.foldername(name))[1] LIKE 'tenant-%' AND (owner_id = (select auth.uid()::text) OR public.is_super_admin()));
ALTER POLICY "Authenticated users can upload tenant assets" ON storage.objects
  WITH CHECK (bucket_id = 'tenant-assets' AND (storage.foldername(name))[1] LIKE 'tenant-%' AND owner_id = (select auth.uid()::text));
ALTER POLICY "Authenticated users can upload branding assets" ON storage.objects
  TO authenticated WITH CHECK (bucket_id = 'branding-assets' AND owner_id = (select auth.uid()::text));
ALTER POLICY "Authenticated users can upload community images" ON storage.objects
  TO authenticated WITH CHECK (bucket_id = 'community-images' AND owner_id = (select auth.uid()::text));