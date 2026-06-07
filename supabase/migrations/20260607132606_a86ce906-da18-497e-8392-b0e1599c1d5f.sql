
-- Align rule_versions.rule_id type to text (matches decision_rules.rule_id)
ALTER TABLE public.rule_versions ALTER COLUMN rule_id TYPE text USING rule_id::text;

-- Rewrite trigger to use existing columns (snapshot, changed_by, created_at)
CREATE OR REPLACE FUNCTION public.snapshot_decision_rule()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE next_version int;
BEGIN
  SELECT COALESCE(MAX(version_number), 0) + 1 INTO next_version
    FROM public.rule_versions WHERE rule_id = NEW.rule_id;
  INSERT INTO public.rule_versions (
    rule_id, version_number, snapshot, change_type, change_reason, created_at
  ) VALUES (
    NEW.rule_id,
    next_version,
    to_jsonb(NEW),
    CASE WHEN TG_OP = 'INSERT' THEN 'insert' ELSE 'update' END,
    'auto-snapshot',
    now()
  );
  RETURN NEW;
END; $function$;
