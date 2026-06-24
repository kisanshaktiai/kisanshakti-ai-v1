COMMENT ON TABLE public.observation_differential_questions IS
  'DEPRECATED 2026-06-07: superseded by observation_translations + intent_translations as SSOT for clarifying-question text. The edge function ai-agriculture-chat now derives differential questions via services/observation-question-resolver.ts. Table retained for historical rows; do not seed new data here.';
