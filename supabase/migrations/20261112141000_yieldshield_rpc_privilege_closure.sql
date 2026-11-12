-- YieldShield emergency privilege closure; replay only through reviewed migrations.
-- No farmer rows, schedule tasks, or agronomy reference data are changed.
BEGIN;
REVOKE ALL ON FUNCTION public.persist_ai_crop_schedule_atomic(jsonb,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.persist_ai_crop_schedule_atomic(jsonb,jsonb,jsonb)
  TO service_role;

-- The full YieldShield schedule integrity migration installs this RPC.
-- Restrict it even if previously deployed with default PUBLIC privileges.
DO $guard$
BEGIN
  IF to_regprocedure('public.complete_schedule_task_atomic(uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer)') IS NOT NULL THEN
    EXECUTE 'REVOKE ALL ON FUNCTION public.complete_schedule_task_atomic(uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer) FROM PUBLIC, anon, authenticated';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.complete_schedule_task_atomic(uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer) TO service_role';
  END IF;
END;
$guard$;
COMMIT;
