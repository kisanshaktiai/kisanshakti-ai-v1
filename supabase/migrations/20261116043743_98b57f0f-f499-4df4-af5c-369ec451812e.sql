ALTER TABLE public.task_completions ADD COLUMN IF NOT EXISTS operation_id uuid;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_completions_operation_id
  ON public.task_completions(operation_id) WHERE operation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.complete_schedule_task_atomic(
  p_task_id uuid, p_farmer_id uuid, p_operation_id uuid,
  p_completed boolean DEFAULT true, p_completed_at timestamptz DEFAULT NULL,
  p_actual_resources jsonb DEFAULT NULL, p_actual_cost numeric DEFAULT NULL,
  p_notes text DEFAULT NULL, p_photos text[] DEFAULT NULL,
  p_weather_conditions jsonb DEFAULT NULL, p_difficulty_rating integer DEFAULT NULL,
  p_effectiveness_rating integer DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp
AS $body$
DECLARE
  v_task public.schedule_tasks%ROWTYPE;
  v_owner record;
  v_prior record;
  v_action_at timestamptz := coalesce(p_completed_at, now());
  v_recur jsonb;
  v_step integer;
  v_end_das integer;
  v_next date;
  v_closed boolean := true;
  v_applied_depth numeric;
  v_volume numeric;
  v_duration numeric;
  v_discharge numeric;
  v_payload jsonb;
BEGIN
  IF p_task_id IS NULL OR p_farmer_id IS NULL OR p_operation_id IS NULL THEN
    RAISE EXCEPTION 'task, verified farmer and idempotency ID are required';
  END IF;
  IF v_action_at > now() + interval '5 minutes' THEN
    RAISE EXCEPTION 'Cannot confirm a future field operation';
  END IF;
  IF p_actual_resources IS NOT NULL AND jsonb_typeof(p_actual_resources) <> 'object' THEN
    RAISE EXCEPTION 'Actual resources must be a JSON object';
  END IF;
  IF p_actual_cost IS NOT NULL AND p_actual_cost < 0 THEN
    RAISE EXCEPTION 'Actual cost cannot be negative';
  END IF;

  SELECT t.* INTO v_task FROM public.schedule_tasks t WHERE t.id = p_task_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Task not found'; END IF;
  SELECT s.land_id, s.sowing_date, s.is_active, s.status,
         s.farmer_id, s.tenant_id, l.farmer_id AS land_farmer,
         l.tenant_id AS land_tenant, l.active_schedule_id
    INTO v_owner
    FROM public.crop_schedules s JOIN public.lands l ON l.id = s.land_id
   WHERE s.id = v_task.schedule_id;
  IF NOT FOUND OR v_owner.farmer_id IS DISTINCT FROM p_farmer_id
      OR v_owner.land_farmer IS DISTINCT FROM p_farmer_id
      OR v_owner.land_tenant IS DISTINCT FROM v_owner.tenant_id
      OR v_task.farmer_id IS DISTINCT FROM p_farmer_id
      OR v_task.tenant_id IS DISTINCT FROM v_owner.tenant_id THEN
    RAISE EXCEPTION 'Task ownership mismatch';
  END IF;

  SELECT task_id, farmer_id, action INTO v_prior
    FROM public.task_completions WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_prior.task_id <> p_task_id OR v_prior.farmer_id <> p_farmer_id
       OR v_prior.action <> (CASE WHEN p_completed THEN 'completed' ELSE 'unmarked' END) THEN
      RAISE EXCEPTION 'Idempotency key reused for a different action';
    END IF;
    SELECT * INTO v_task FROM public.schedule_tasks WHERE id = p_task_id;
    RETURN jsonb_build_object('task',to_jsonb(v_task),'idempotent',true);
  END IF;
  IF NOT v_owner.is_active OR v_owner.status <> 'active'
     OR v_owner.active_schedule_id IS DISTINCT FROM v_task.schedule_id THEN
    RAISE EXCEPTION 'Task schedule is no longer active';
  END IF;

  IF p_completed AND v_task.status = 'completed' THEN
    RETURN jsonb_build_object('task',to_jsonb(v_task),'already_completed',true);
  END IF;
  IF NOT p_completed AND v_task.status <> 'completed' THEN
    RETURN jsonb_build_object('task',to_jsonb(v_task),'already_pending',true);
  END IF;

  v_recur := v_task.resources->'recurrence';
  IF p_completed AND v_recur IS NOT NULL AND v_owner.sowing_date IS NOT NULL
     AND (v_recur->>'interval_days') IS NOT NULL AND (v_recur->>'window_end') IS NOT NULL THEN
    v_step := (v_recur->>'interval_days')::integer;
    v_end_das := (v_recur->>'window_end')::integer;
    IF v_step > 0 AND v_step <= 365 AND v_end_das >= 0 THEN
      v_next := greatest(v_task.task_date, v_action_at::date) + v_step;
      IF v_next <= v_owner.sowing_date + v_end_das THEN v_closed := false; END IF;
    END IF;
  END IF;

  INSERT INTO public.task_completions(
    task_id, farmer_id, action, action_date, actual_resources, actual_cost,
    notes, photos, weather_conditions, difficulty_rating, effectiveness_rating, operation_id
  ) VALUES (
    p_task_id, p_farmer_id, CASE WHEN p_completed THEN 'completed' ELSE 'unmarked' END,
    v_action_at, CASE WHEN p_completed THEN p_actual_resources ELSE NULL END,
    CASE WHEN p_completed THEN p_actual_cost ELSE NULL END, p_notes,
    CASE WHEN p_completed THEN p_photos ELSE NULL END,
    CASE WHEN p_completed THEN p_weather_conditions ELSE NULL END,
    p_difficulty_rating, p_effectiveness_rating, p_operation_id
  );

  UPDATE public.schedule_tasks
     SET status = CASE WHEN p_completed AND v_closed THEN 'completed' ELSE 'pending' END,
         completed_at = CASE WHEN p_completed AND v_closed THEN v_action_at ELSE NULL END,
         task_date = CASE WHEN p_completed AND NOT v_closed THEN v_next ELSE task_date END,
         projected_date = CASE WHEN p_completed AND NOT v_closed THEN v_next ELSE projected_date END,
         resources = CASE WHEN p_completed AND NOT v_closed
             THEN coalesce(resources,'{}'::jsonb) ||
              jsonb_build_object('last_occurrence_completed_at',v_action_at,'next_occurrence_date',v_next)
            ELSE resources END,
         updated_at = now()
   WHERE id = p_task_id RETURNING * INTO v_task;

  IF p_completed AND v_closed THEN
    UPDATE public.task_notifications SET status = 'cancelled', updated_at = now()
     WHERE task_id = p_task_id AND sent_at IS NULL AND coalesce(status,'pending') = 'pending';
  END IF;

  IF p_completed AND v_task.task_type = 'irrigation'
     AND p_actual_resources IS NOT NULL AND v_action_at::date = current_date THEN
    IF jsonb_typeof(p_actual_resources->'applied_depth_mm') = 'number' THEN
      v_applied_depth := (p_actual_resources->>'applied_depth_mm')::numeric;
    END IF;
    IF jsonb_typeof(p_actual_resources->'volume_litres') = 'number' THEN
      v_volume := (p_actual_resources->>'volume_litres')::numeric;
    END IF;
    IF jsonb_typeof(p_actual_resources->'duration_minutes') = 'number' THEN
      v_duration := (p_actual_resources->>'duration_minutes')::numeric;
    END IF;
    IF jsonb_typeof(p_actual_resources->'pump_discharge_lph') = 'number' THEN
      v_discharge := (p_actual_resources->>'pump_discharge_lph')::numeric;
    END IF;
    IF coalesce(v_applied_depth,0) < 0 OR coalesce(v_volume,0) < 0
       OR coalesce(v_duration,0) < 0 OR coalesce(v_discharge,0) < 0 THEN
      RAISE EXCEPTION 'Irrigation measurements must be non-negative';
    END IF;
    IF coalesce(v_applied_depth,0) > 0 OR coalesce(v_volume,0) > 0
       OR (coalesce(v_duration,0) > 0 AND coalesce(v_discharge,0) > 0) THEN
      v_payload := jsonb_strip_nulls(jsonb_build_object(
        'applied_depth_mm',v_applied_depth, 'volume_litres',v_volume,
        'duration_minutes',v_duration, 'pump_discharge_lph',v_discharge,
        'actual_at',v_action_at, 'task_id',p_task_id,
        'completion_operation_id',p_operation_id,
        'source','verified_farmer_task_completion'));
      INSERT INTO public.crop_lifecycle_events(tenant_id,farmer_id,land_id,schedule_id,event_type,payload,actor)
      VALUES (v_owner.tenant_id,p_farmer_id,v_owner.land_id,v_task.schedule_id,'IRRIGATION_APPLIED',v_payload,p_farmer_id);
    END IF;
  END IF;
  RETURN jsonb_build_object('task',to_jsonb(v_task),'idempotent',false,'recurrence_open',NOT v_closed);
END
$body$;
REVOKE ALL ON FUNCTION public.complete_schedule_task_atomic(
  uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer
) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_schedule_task_atomic(
  uuid,uuid,uuid,boolean,timestamptz,jsonb,numeric,text,text[],jsonb,integer,integer
) TO service_role;