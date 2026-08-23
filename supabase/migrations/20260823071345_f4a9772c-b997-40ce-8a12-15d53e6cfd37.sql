UPDATE public.schedule_tasks
SET task_type = m.canonical
FROM public.task_type_map m
WHERE public.schedule_tasks.task_type = m.raw_value
  AND public.schedule_tasks.task_type <> m.canonical;

ALTER TABLE public.schedule_tasks
  ADD CONSTRAINT schedule_tasks_task_type_check
  CHECK (task_type = ANY (ARRAY[
    'land_preparation','seed_treatment','nursery','sowing','gap_filling',
    'nutrition','micronutrient','irrigation','weed_management','intercultural',
    'pest_management','disease_management','growth_regulation','monitoring',
    'harvest','post_harvest','residue_management','planning','advisory'
  ]));